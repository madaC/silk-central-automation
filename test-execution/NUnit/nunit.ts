/*
 * (c) Copyright 2021-2022 Micro Focus or one of its affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import fs from 'fs';
import OctaneTest from '../model/octane/octaneTest';
import Credentials from '../model/credentials';
import NunitDirectories from '../model/nunitDirectories';
import {
    deserializeSourceControlDetails,
    getNunitOctaneTestByName,
    getAppModuleBySourceType,
    validateOctaneTest
} from '../utils/octaneClient.js';
import SourceControlProfile from '../model/silk/sourceControlProfile';
import { getAbsoluteClasspath } from '../utils/classpath.js';
import {
    cleanUpWorkingFiles,
    EXECUTABLE_FILE,
    getEnvironmentVariables,
    getTestParameters,
    getSourcesFolder, getTestNames,
    replaceParametersReferences,
    replaceParamsValuesInNunitTest,
    TEST_RESULT_FILE, ROOT_SOURCES_FOLDER
} from '../utils/files.js';
import OctaneApplicationModule from "../model/octane/octaneApplicationModule";
import format from "dateformat";

const NUNIT3_CONSOLE = 'nunit3-console.exe';

const createCommand = async (
    nunitDirectories: NunitDirectories,
    test: OctaneTest,
    testContainerAppModule: OctaneApplicationModule,
    sourceControlProfile: SourceControlProfile | undefined,
    timestamp: string,
    isLastIteration: boolean | undefined,
    iterationIndex: number | undefined,
    credentials?: Credentials
) => {
    let dllPath;
    if (sourceControlProfile) {
        const rootWorkingFolder = getSourcesFolder(test);
        sourceControlProfile!.createClasspathFolder(
            rootWorkingFolder,
            credentials
        );

        dllPath = getAbsoluteClasspath(
            sourceControlProfile!.getAbsoluteWorkingFolderPath(rootWorkingFolder),
            test.sc_nunit_assembly_udf!,
            sourceControlProfile.WorkingFolder
        );
    } else {
        dllPath = getAbsoluteClasspath('', test.sc_nunit_assembly_udf!, undefined);
    }
    let nunitDirectory = '';
    const octaneNunitDir = test.sc_nunit_directory_udf;
    if (octaneNunitDir) {
        if (octaneNunitDir.endsWith(NUNIT3_CONSOLE)) {
            if (nunitDirectories.nunit3) {
                nunitDirectory = nunitDirectories.nunit3;
            } else {
                throw new Error('Missing nunit3 directory');
            }
        } else {
            if (nunitDirectories.nunit2) {
                nunitDirectory = nunitDirectories.nunit2;
            } else {
                throw new Error('Missing nunit2 directory');
            }
        }
    } else {
        throw new Error(
            `Nunit Directory udf has empty value for the Octane automated test with with the name ${test.name}`
        );
    }

    console.log('nunit_exe: ' + nunitDirectory);
    const nunitOptions =
        test.sc_nunit_options_udf != null ? test.sc_nunit_options_udf : '';
    let outputFilePath;
    if (isLastIteration != undefined && iterationIndex != undefined) {
        outputFilePath = `${TEST_RESULT_FILE}/${test.name}_${timestamp}/${test.name}_iteration${iterationIndex}/output_nunit.xml`;
    } else {
        outputFilePath = `${TEST_RESULT_FILE}/${test.name}_${timestamp}/output_nunit.xml`;
    }
    let command;
    //this should always be in one line
    command = `"${nunitDirectory}" ${nunitOptions} --result="${outputFilePath}";transform="./nunit3-junit.xslt" "${dllPath}"`;

    return command;
};

const getJavaCommand = (
    octaneTestName: string,
    runnerJarPath: string,
    timestamp: string,
    isLastIteration: boolean | undefined,
    iterationIndex:number | undefined
) => {
    //this should always be in one line
    return `java -cp "${runnerJarPath}" com.microfocus.adm.almoctane.migration.plugin_silk_central.nunit.NUnitCmdLineWrapper "${octaneTestName}" ${timestamp} ${isLastIteration ?? ''} ${iterationIndex ?? ''}`;
};

const getExecutableFile = async (
    testsToRun: string,
    runnerJarPath: string,
    nunitDirectories: NunitDirectories,
    suiteId: string,
    suiteRunId: string,
    credentials?: Credentials
) => {
    cleanUpWorkingFiles();
    fs.mkdirSync(ROOT_SOURCES_FOLDER);
    if (fs.existsSync('./java_command_to_execute.bat')) {
        fs.unlinkSync('./java_command_to_execute.bat');
    }

    const testNames: string[] = getTestNames(testsToRun);

    for (const testName of testNames) {
        const test = await getNunitOctaneTestByName(testName);
        validateOctaneTest(test, testName);

        const testContainerAppModule: OctaneApplicationModule =
            await getAppModuleBySourceType(test, 'test container');
        const sourceControlProfile: SourceControlProfile | undefined =
            deserializeSourceControlDetails(
                testContainerAppModule.sc_source_control_udf
            );
        const timestamp: string = format(Date.now(), "yyyy-MM-dd_HH-mm-ss-ll");
        const environmentParams = getEnvironmentVariables();
        let parameters: Map<string, string>[] = await getTestParameters(test, testContainerAppModule, suiteId,
            suiteRunId, timestamp, sourceControlProfile);

        const iterationsWithReplacedParams = await replaceParametersReferences(
            parameters,
            environmentParams
        );

        let isLastIteration: boolean | undefined;
        let iterationIndex: number | undefined;
        for (let i = 0; i < iterationsWithReplacedParams.length; i++) {
            const iteration = iterationsWithReplacedParams[i];
            const testWithParams = replaceParamsValuesInNunitTest(
                iteration,
                environmentParams,
                test
            );
            if (iterationsWithReplacedParams.length > 1) {
                isLastIteration = i == iterationsWithReplacedParams.length - 1;
                iterationIndex = i;
            }
            const command = await createCommand(
                nunitDirectories,
                testWithParams,
                testContainerAppModule,
                sourceControlProfile,
                timestamp,
                isLastIteration,
                iterationIndex,
                credentials
            );
            fs.appendFileSync(EXECUTABLE_FILE, command + '\n');
            const javaCommand = getJavaCommand(
                testName,
                runnerJarPath,
                timestamp,
                isLastIteration,
                iterationIndex
            );
            fs.appendFileSync(
                './java_command_to_execute.bat',
                javaCommand + '\n'
            );
        }
    }
};

let credentials: Credentials | undefined = undefined;
let nunitDirectories: NunitDirectories | undefined = undefined;
const testsToRun = process.argv[2];
const jarPath = process.argv[3];
const suiteId = process.argv[4];
const suiteRunId = process.argv[5];
const nunit2 = process.argv[6];
const nunit3 = process.argv[7];
const username = process.argv[8];
const password = process.argv[9];

if (!testsToRun || !jarPath) {
    throw new Error('testsToRun and jarPath parameters are mandatory!');
}

if (username && password) {
    credentials = {
        username: username,
        pat: password
    };
}

nunitDirectories = {
    nunit2: nunit2,
    nunit3: nunit3
};

getExecutableFile(testsToRun, jarPath, nunitDirectories, suiteId, suiteRunId, credentials)
    .then(() => console.log('Executable file was successfully created.'))
    .catch(err => console.error(err.message, err));

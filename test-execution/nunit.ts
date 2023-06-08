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
import OctaneTest from './model/octane/octaneTest';
import Credentials from './model/credentials';
import NunitDirectories from './model/nunitDirectories';
import {
    deserializeSourceControlDetails,
    getApplicationModuleIds,
    getNunitOctaneTestByName,
    getAppModuleFromIdsBySourceType,
    validateOctaneTest,
    getAttachmentIds,
    getAttachmentFromIdsByName,
    getAttachmentContentById
} from './utils/octaneClient.js';
import SourceControlProfile from './model/silk/sourceControlProfile';
import { getAbsoluteClasspath } from './utils/classpath.js';
import {
    cleanUpWorkingFiles,
    EXECUTABLE_FILE,
    getRootWorkingFolder,
    replaceParametersFromCSV,
    replaceParamsValuesInNunitTest,
    TEST_RESULT_FILE
} from './utils/files.js';
import OctaneAttachment from './model/octane/octaneAttachment';
import csv from "csvtojson";
import it from "node:test";

const NUNIT3_CONSOLE = 'nunit3-console.exe';

const createCommand = async (
    nunitDirectories: NunitDirectories,
    test: OctaneTest,
    timestamp: number,
    credentials?: Credentials
) => {
    const assignedAppModulesIds = getApplicationModuleIds(
        test.application_modules!
    );
    const testContainerAppModule = await getAppModuleFromIdsBySourceType(
        assignedAppModulesIds,
        'test container'
    );
    const sourceControlProfile: SourceControlProfile | null =
        deserializeSourceControlDetails(
            testContainerAppModule.sc_source_control_udf
        );

    let dllPath;
    if (sourceControlProfile) {
        const rootWorkingFolder = getRootWorkingFolder(test);
        sourceControlProfile!.createClasspathFolder(
            rootWorkingFolder,
            credentials
        );

        dllPath = getAbsoluteClasspath(
            sourceControlProfile!.getAbsoluteWorkingFolderPath(
                rootWorkingFolder
            ),
            test.sc_nunit_assembly_udf!
        );
    } else {
        dllPath = getAbsoluteClasspath('', test.sc_nunit_assembly_udf!);
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
    const outputFilePath = `./${TEST_RESULT_FILE}/${test.name}_${timestamp}_output_nunit.xml`;
    let command;
    command = `"${nunitDirectory}" ${nunitOptions} --result="${outputFilePath}";transform="./nunit3-junit.xslt" ${dllPath}`;

    return command;
};

const getJavaCommand = (
    testMethod: string,
    runnerJarPath: string,
    timestamp: number
) => {
    return `java -cp "${runnerJarPath}" com.microfocus.adm.almoctane.migration.plugin_silk_central.nunit.NUnitCmdLineWrapper ${testMethod} ${timestamp}`;
};

const getExecutableFile = async (
    testsToRun: string,
    runnerJarPath: string,
    nunitDirectories: NunitDirectories,
    githubCredentials?: Credentials
) => {
    cleanUpWorkingFiles();
    if (fs.existsSync('./java_command_to_execute.bat')) {
        fs.unlinkSync('./java_command_to_execute.bat');
    }

    const testNames = testsToRun.substring(1).split('+');

    for (const testName of testNames) {
        const test = await getNunitOctaneTestByName(testName);
        validateOctaneTest(test, testName);
        const testAttachmentsIds = getAttachmentIds(test.attachments!);
        const csvParametersAttachment: OctaneAttachment =
            await getAttachmentFromIdsByName(
                testAttachmentsIds,
                'SC_parameters.csv'
            );
        const csvParametersAttachmentContent = await getAttachmentContentById(
            Number.parseInt(csvParametersAttachment.id)
        );
        let iterations: { [key: string]: string }[] = (await csv().fromString(csvParametersAttachmentContent.toString()));
        const iterationsParams = await replaceParametersFromCSV(iterations);
        for (const iteration of iterationsParams) {
            const testWithParams = replaceParamsValuesInNunitTest(
                iteration,
                test
            );
            const timestamp = Date.now();
            const command = await createCommand(
                nunitDirectories,
                testWithParams,
                timestamp,
                githubCredentials
            );
            fs.appendFileSync(EXECUTABLE_FILE, command + '\n');
            const javaCommand = getJavaCommand(
                testName,
                runnerJarPath,
                timestamp
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
const nunit2 = process.argv[4];
const nunit3 = process.argv[5];
const username = process.argv[6];
const password = process.argv[7];

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

getExecutableFile(testsToRun, jarPath, nunitDirectories, credentials)
    .then(() => console.log('Executable file was successfully created.'))
    .catch(err => console.error(err.message, err));

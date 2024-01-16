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
import Credentials from '../model/credentials';
import {
    deserializeSourceControlDetails, getAppModuleBySourceType,
    getOctaneTestByName,
    validateOctaneJUnitTest
} from '../utils/octaneClient.js';
import SourceControlProfile from '../model/silk/sourceControlProfile';
import {
    cleanUpWorkingFiles,
    EXECUTABLE_FILE,
    getEnvironmentVariables,
    getTestParameters,
    getTestNames,
    replaceParametersReferences,
    replaceParamsValuesInJunitTest,
    ROOT_SOURCES_FOLDER,
    getJavaExecutablePath,
    getJVMOptions,
    getRunnerJarAbsolutePath
} from '../utils/files.js';
import { getAbsoluteClasspath } from '../utils/classpath.js';
import OctaneApplicationModule from '../model/octane/octaneApplicationModule';
import OctaneTest from '../model/octane/octaneTest';
import format from "dateformat";
import {TestFields} from "../model/testFields.js";

const getCommand = (
    octaneTestName: string,
    test: OctaneTest,
    timestamp: string,
    isLastIteration: boolean | undefined,
    iterationIndex: number | undefined,
    paramsForCommand: string,
    absoluteClasspath: string
): string => {
    const commandArray: string[] = [];

    const methodName = test.sc_method_name_udf;
    const classNames = test.sc_class_names_udf;
    const javaExecutablePath = getJavaExecutablePath(test);
    const jvmOptions = getJVMOptions(test);

    commandArray.push(`"${javaExecutablePath}"`);
    commandArray.push(jvmOptions);
    commandArray.push('-cp');
    commandArray.push(`"${getRunnerJarAbsolutePath()};${absoluteClasspath}"`);
    commandArray.push(paramsForCommand);
    commandArray.push('com.microfocus.adm.almoctane.migration.plugin_silk_central.junit.JUnitCmdLineWrapper');

    if (!methodName && !classNames) {
        commandArray.push('RunMeAsAJar null');
    } else if (classNames && classNames.split(' ').length > 0) {
        commandArray.push(`"${classNames}"`);
        if (methodName) {
            commandArray.push(`"${methodName}"`);
        } else {
            commandArray.push('null');
        }
    } else {
        throw new Error(
            'Could not create execution command for Octane automated test of type JUnit with name' +
                octaneTestName
        );
    }
    commandArray.push(octaneTestName);
    commandArray.push(timestamp);

    if (isLastIteration !== undefined && iterationIndex !== undefined) {
        commandArray.push(String(isLastIteration));
        commandArray.push(iterationIndex.toString());
    }

    return commandArray.join(' ');
};

const generateExecutableFile = async (
    testsToRun: string,
    suiteId: string,
    suiteRunId: string,
    credentials?: Credentials
): Promise<void> => {
    cleanUpWorkingFiles();
    fs.mkdirSync(ROOT_SOURCES_FOLDER);

    const testNames: string[] = getTestNames(testsToRun);
    for (const testName of testNames) {
        const test = await getOctaneTestByName(testName, TestFields.JUnit);
        validateOctaneJUnitTest(test, testName);

        const testContainerAppModule: OctaneApplicationModule =
            await getAppModuleBySourceType(test, 'test container');
        const sourceControlProfile: SourceControlProfile | undefined =
            deserializeSourceControlDetails(
                testContainerAppModule.sc_source_control_udf
            );
        const timestamp: string = format(Date.now(), "yyyy-mm-dd_HH-MM-ss-ll");
        const environmentParams = getEnvironmentVariables();
        let parameters: Map<string, string>[] = await getTestParameters(
            test,
            testContainerAppModule,
            suiteId,
            suiteRunId,
            timestamp,
            sourceControlProfile
        );

        for (const parameterRow of parameters) {
            let parametersForCommand = '';
            parameterRow.forEach((value, key) => {
                parametersForCommand = `${parametersForCommand} "-D${key}=${value}"`;
            });
            parameterRow.set('parametersForJavaCommand', parametersForCommand);
        }

        const iterationsWithReplacedParams = await replaceParametersReferences(
            parameters,
            environmentParams
        );

        let isLastIteration: boolean | undefined;
        let iterationIndex: number | undefined;
        for (let i = 0; i < iterationsWithReplacedParams.length; i++) {
            const iteration = iterationsWithReplacedParams[i];
            const testWithParams = replaceParamsValuesInJunitTest(
                iteration,
                environmentParams,
                test
            );

            if (iterationsWithReplacedParams.length > 1) {
                isLastIteration = i == iterationsWithReplacedParams.length - 1;
                iterationIndex = i;
            }
            const classpath = testWithParams.sc_classpath_udf!.replace(/\\/g, '/');
            let absoluteClasspath;
            if (sourceControlProfile) {
                await sourceControlProfile!.fetchResources(credentials);
                absoluteClasspath = getAbsoluteClasspath(
                    sourceControlProfile!.getAbsoluteWorkingFolderPath(),
                    classpath,
                    sourceControlProfile.WorkingFolder
                );
            } else {
                absoluteClasspath = getAbsoluteClasspath('', classpath, undefined);
            }

            const command = getCommand(
                testName,
                testWithParams,
                timestamp,
                isLastIteration,
                iterationIndex,
                iteration.get('parametersForJavaCommand')!,
                absoluteClasspath
            );

            fs.appendFileSync(EXECUTABLE_FILE, command + '\n');
        }
    }
};

let credentials: Credentials | undefined = undefined;

const testsToRun = process.argv[2];
const suiteId = process.argv[3];
const suiteRunId = process.argv[4];
const username = process.argv[5];
const password = process.argv[6];

if (username && password) {
    credentials = {
        username: username,
        password: password
    };
}

generateExecutableFile(testsToRun, suiteId, suiteRunId, credentials)
    .then(() => console.log('Executable file was successfully created.'))
    .catch(err => console.error(err.message, err));

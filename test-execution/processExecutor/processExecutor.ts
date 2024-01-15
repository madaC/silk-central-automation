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
import {
    cleanUpWorkingFiles,
    EXECUTABLE_FILE,
    getEnvironmentVariables,
    getTestParameters,
    getTestNames,
    replaceParametersReferences,
    replaceParamsValuesInProcessExecutorTest, getRunnerJarAbsolutePath
} from '../utils/files.js';
import {getAppModuleBySourceType, getOctaneTestByName} from '../utils/octaneClient.js';
import fs from 'fs';
import OctaneTest from '../model/octane/octaneTest';
import OctaneApplicationModule from '../model/octane/octaneApplicationModule';
import path from 'node:path';

import format from 'dateformat';
import {TestFields} from "../model/testFields.js";

const generateExecutableFile = async (
    testsToRun: string,
    suiteId: string,
    suiteRunId: string
): Promise<void> => {
    cleanUpWorkingFiles();
    const testNames: string[] = getTestNames(testsToRun);
    for (const testName of testNames) {
        const test : OctaneTest = await getOctaneTestByName(testName, TestFields.ProcessExecutor);
        const testContainerAppModule: OctaneApplicationModule =
            await getAppModuleBySourceType(
                test,
                'test container'
            );

        const timestamp: string = format(Date.now(), "yyyy-mm-dd_HH-MM-ss-ll");
        const environmentParams = getEnvironmentVariables();
        let parameters: Map<string, string>[] = await getTestParameters(
            test,
            testContainerAppModule,
            suiteId,
            suiteRunId,
            timestamp,
            undefined
        );

        const iterationsWithReplacedParams = await replaceParametersReferences(
            parameters,
            environmentParams
        );

        let isLastIteration: boolean | undefined;
        let iterationIndex: number | undefined;
        for (let i = 0; i < iterationsWithReplacedParams.length; i++) {
            const iteration = iterationsWithReplacedParams[i];
            const testWithParams = replaceParamsValuesInProcessExecutorTest(
                iteration,
                environmentParams,
                test
            );
            if (iterationsWithReplacedParams.length > 1) {
                isLastIteration = i == iterationsWithReplacedParams.length - 1;
                iterationIndex = i;
            }
            const command = await getCommand(
                testName,
                testWithParams,
                timestamp,
                isLastIteration,
                iterationIndex
            );
            fs.appendFileSync(EXECUTABLE_FILE, command + '\n');
        }
   }
};

const getCommand = async (
    octaneTestName: string,
    test: OctaneTest,
    timestamp: string,
    isLastIteration: boolean | undefined,
    iterationIndex: number | undefined
): Promise<string> => {
    const commandArray: string[] = [];

    commandArray.push('java');
    commandArray.push('-cp');
    commandArray.push(`"${getRunnerJarAbsolutePath()}"`);
    commandArray.push('com.microfocus.adm.almoctane.migration.plugin_silk_central.process.executor.ProcessExecutor');

    if (test.sc_working_folder_udf && path.isAbsolute(test.sc_working_folder_udf)) {
        commandArray.push(test.sc_working_folder_udf);
    } else {
        commandArray.push('null');
    }

    commandArray.push(test.name);
    commandArray.push(timestamp);

    if (isLastIteration !== undefined && iterationIndex !== undefined) {
        commandArray.push(String(isLastIteration));
        commandArray.push(iterationIndex.toString());
    }
    commandArray.push(test.sc_executable_name_udf.replace(/"/g, '\\"'));

    if (test.sc_argument_list_udf) {
        const lines: string[] = test.sc_argument_list_udf
            .replace(/"/g, '\\"')
            .split('\n');
        for (const line of lines) {
            commandArray.push(line);
        }
    }

    return commandArray.join(' ');
};

const testsToRun = process.argv[2];
const suiteId = process.argv[3];
const suiteRunId = process.argv[4];

generateExecutableFile(testsToRun, suiteId, suiteRunId)
    .then(() => console.log('Executable file was successfully created.'))
    .catch(err => console.error(err.message, err));

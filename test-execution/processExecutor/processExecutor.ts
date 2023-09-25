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
    replaceParamsValuesInProcessExecutorTest
} from '../utils/files.js';
import {getAppModuleBySourceType, getOctaneProcessExecutorTestByName} from '../utils/octaneClient.js';
import fs from 'fs';
import OctaneTest from '../model/octane/octaneTest';
import OctaneApplicationModule from '../model/octane/octaneApplicationModule';
import path from 'node:path';

import format from 'dateformat';

const generateExecutableFile = async (
    testsToRun: string,
    jarPath: string,
    suiteId: string,
    suiteRunId: string
): Promise<void> => {
    cleanUpWorkingFiles();
    const testNames: string[] = getTestNames(testsToRun);
    for (const testName of testNames) {
        const test : OctaneTest = await getOctaneProcessExecutorTestByName(testName);
        const testContainerAppModule: OctaneApplicationModule =
            await getAppModuleBySourceType(
                test,
                'test container'
            );

        const timestamp: string = format(Date.now(), "yyyy-MM-dd_HH-mm-ss-ll");
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
                jarPath,
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
    runnerJarPath: string,
    test: OctaneTest,
    timestamp: string,
    isLastIteration: boolean |undefined,
    iterationIndex: number |undefined
): Promise<string> => {
    if (test.sc_working_folder_udf && path.isAbsolute(test.sc_working_folder_udf)) {
        return `java -cp "${runnerJarPath}" com.microfocus.adm.almoctane.migration.plugin_silk_central.process.executor.ProcessExecutor "${test.sc_working_folder_udf}" "${test.name}" ${timestamp} ${isLastIteration ?? ''} ${iterationIndex ?? ''} ${test.sc_executable_name_udf?.replace(/"/g, '\\"')} ${test.sc_argument_list_udf?.replace(/"/g, '\\"')}`;
    }
    return `java -cp "${runnerJarPath}" com.microfocus.adm.almoctane.migration.plugin_silk_central.process.executor.ProcessExecutor null "${test.name}" ${timestamp} ${isLastIteration ?? ''} ${iterationIndex ?? ''} ${test.sc_executable_name_udf?.replace(/"/g,'\\"')} ${test.sc_argument_list_udf?.replace(/"/g, '\\"')}`;
};

const testsToRun = process.argv[2];
const jarPath = process.argv[3];
const suiteId = process.argv[4];
const suiteRunId = process.argv[5];

if (!testsToRun) {
    throw new Error('testsToRun parameter is mandatory!');
}

generateExecutableFile(testsToRun, jarPath, suiteId, suiteRunId)
    .then(() => console.log('Executable file was successfully created.'))
    .catch(err => console.error(err.message, err));

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
import Credentials from './model/credentials';
import {
    deserializeSourceControlDetails,
    getJunitOctaneTestByName,
    validateOctaneJUnitTest,
    getAppModuleBySourceType
} from './utils/octaneClient.js';
import SourceControlProfile from './model/silk/sourceControlProfile';
import {
    cleanUpWorkingFiles,
    EXECUTABLE_FILE,
    getEnvironmentVariables,
    getTestParameters,
    getRootWorkingFolder, getTestNames,
    replaceParametersFromCSV,
    replaceParamsValuesInJunitTest
} from './utils/files.js';
import { getAbsoluteClasspath } from './utils/classpath.js';
import OctaneApplicationModule from './model/octane/octaneApplicationModule';
import OctaneTest from './model/octane/octaneTest';

const getCommand = async (
    octaneTestName: string,
    runnerJarPath: string,
    test: OctaneTest,
    paramsForCommand: string,
    testContainerAppModule: OctaneApplicationModule,
    sourceControlProfile: SourceControlProfile | undefined,
    isLastIteration?: boolean,
    credentials?: Credentials
): Promise<string> => {
    const classpath = test.sc_classpath_udf!.replace(/\\/g, '/');
    let absoluteClasspath;
    if (sourceControlProfile) {
        const rootWorkingFolder = getRootWorkingFolder(test);
        await sourceControlProfile!.createClasspathFolder(
            rootWorkingFolder,
            credentials
        );

        absoluteClasspath = getAbsoluteClasspath(
            sourceControlProfile!.getAbsoluteWorkingFolderPath(
                rootWorkingFolder
            ),
            classpath
        );
    } else {
        absoluteClasspath = getAbsoluteClasspath('', classpath);
    }
    const methodName = test.sc_method_name_udf;
    const classNames = test.sc_class_names_udf;

    return createCommand(
        methodName,
        octaneTestName,
        classNames,
        absoluteClasspath,
        runnerJarPath,
        paramsForCommand,
        isLastIteration
    );
};

const createCommand = (
    methodName: string | null | undefined,
    octaneTestName: string,
    classNames: string | null | undefined,
    absoluteClasspath: string,
    runnerJarPath: string,
    paramsForCommand: string,
    isLastIteration?: boolean
): string => {
    //the command should always be in one line
    let command;
    if (!methodName && !classNames) {
        command = `java -cp "${absoluteClasspath};${runnerJarPath}" ${paramsForCommand} com.microfocus.adm.almoctane.migration.plugin_silk_central.junit.JUnitCmdLineWrapper RunMeAsAJar null ${octaneTestName} ${
            isLastIteration ?? ''
        }`;
    } else if (!methodName && classNames && classNames.split(' ').length > 0) {
        command = `java -cp "${absoluteClasspath};${runnerJarPath}" ${paramsForCommand} com.microfocus.adm.almoctane.migration.plugin_silk_central.junit.JUnitCmdLineWrapper "${classNames}" null ${octaneTestName} ${
            isLastIteration ?? ''
        }`;
    } else if (methodName && classNames && classNames.split(' ').length > 0) {
        command = `java -cp "${absoluteClasspath};${runnerJarPath}" ${paramsForCommand} com.microfocus.adm.almoctane.migration.plugin_silk_central.junit.JUnitCmdLineWrapper "${classNames}" ${methodName} ${octaneTestName} ${
            isLastIteration ?? ''
        }`;
    } else {
        throw new Error(
            'Could not create execution command for Octane automated test of type JUnit with name' +
                octaneTestName
        );
    }

    return command;
};

const generateExecutableFile = async (
    testsToRun: string,
    runnerJarPath: string,
    suiteId: string,
    suiteRunId: string,
    credentials?: Credentials
): Promise<void> => {
    cleanUpWorkingFiles();

    const testNames: string[] = getTestNames(testsToRun);
    for (const testName of testNames) {
        const test = await getJunitOctaneTestByName(testName);
        validateOctaneJUnitTest(test, testName);

        const testContainerAppModule: OctaneApplicationModule =
            await getAppModuleBySourceType(test, 'test container');
        const sourceControlProfile: SourceControlProfile | undefined =
            deserializeSourceControlDetails(
                testContainerAppModule.sc_source_control_udf
            );
        const environmentParams = getEnvironmentVariables();
        let iterations: { [key: string]: string }[] = await getTestParameters(test, testContainerAppModule, suiteId,
            suiteRunId, sourceControlProfile);

        for (const iteration of iterations) {
            let parametersForCommand = '';
            for (let param in iteration) {
                parametersForCommand = `${parametersForCommand} "-D${param}=${iteration[param]}"`;
            }
            iteration['parametersForJavaCommand'] = parametersForCommand;
        }

        const iterationsWithReplacedParams = await replaceParametersFromCSV(
            iterations,
            environmentParams
        );

        for (let i = 0; i < iterationsWithReplacedParams.length; i++) {
            const iteration = iterationsWithReplacedParams[i];
            const testWithParams = replaceParamsValuesInJunitTest(
                iteration,
                environmentParams,
                test
            );

            let isLastIteration: boolean | undefined;
            if (iterationsWithReplacedParams.length > 1) {
                isLastIteration = i == iterationsWithReplacedParams.length - 1;
            }
            const command = await getCommand(
                testName,
                runnerJarPath,
                testWithParams,
                iteration['parametersForJavaCommand'],
                testContainerAppModule,
                sourceControlProfile,
                isLastIteration,
                credentials
            );

            fs.appendFileSync(EXECUTABLE_FILE, command + '\n');
        }
    }
};

let credentials: Credentials | undefined = undefined;

const testsToRun = process.argv[2];
const jarPath = process.argv[3];
const suiteId = process.argv[4];
const suiteRunId = process.argv[5];
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

generateExecutableFile(testsToRun, jarPath, suiteId, suiteRunId, credentials)
    .then(() => console.log('Executable file was successfully created.'))
    .catch(err => console.error(err.message, err));

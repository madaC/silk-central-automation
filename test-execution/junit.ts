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
    getApplicationModuleIds,
    getAppModuleFromIdsBySourceType
} from './utils/octaneClient.js';
import SourceControlProfile from './model/silk/sourceControlProfile';
import {
    cleanUpWorkingFiles,
    EXECUTABLE_FILE,
    getRootWorkingFolder
} from './utils/files.js';
import { getAbsoluteClasspath } from './utils/classpath.js';
import OctaneApplicationModule from "./model/octane/octaneApplicationModule";

const getCommand = async (
    octaneTestName: string,
    runnerJarPath: string,
    credentials?: Credentials
): Promise<string> => {
    const test = await getJunitOctaneTestByName(octaneTestName);
    validateOctaneJUnitTest(test, octaneTestName);

    const assignedAppModulesIds = getApplicationModuleIds(test.application_modules!);
    const testContainerAppModule:OctaneApplicationModule = await getAppModuleFromIdsBySourceType(
        assignedAppModulesIds, 'test container'
    );

    const sourceControlProfile: SourceControlProfile | null =
        deserializeSourceControlDetails(
            testContainerAppModule.sc_source_control_udf
        );

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
        runnerJarPath
    );
};

const createCommand = (
    methodName: string | null | undefined,
    octaneTestName: string,
    classNames: string | null | undefined,
    absoluteClasspath: string,
    runnerJarPath: string
): string => {
    let command;
    if (!methodName && !classNames) {
        command = `java -cp "${absoluteClasspath};${runnerJarPath}" com.microfocus.adm.almoctane.migration.plugin_silk_central.junit.JUnitCmdLineWrapper RunMeAsAJar null ${octaneTestName}`;
    } else if (!methodName && classNames && classNames.split(' ').length > 0) {
        command = `java -cp "${absoluteClasspath};${runnerJarPath}" com.microfocus.adm.almoctane.migration.plugin_silk_central.junit.JUnitCmdLineWrapper "${classNames}" null ${octaneTestName}`;
    } else if (methodName && classNames && classNames.split(' ').length > 0) {
        command = `java -cp "${absoluteClasspath};${runnerJarPath}" com.microfocus.adm.almoctane.migration.plugin_silk_central.junit.JUnitCmdLineWrapper "${classNames}" ${methodName} ${octaneTestName}`;
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
    githubCredentials?: Credentials
): Promise<void> => {
    cleanUpWorkingFiles();

    const testNames = testsToRun.substring(1).split('+');
    for (const testName of testNames) {
        const command = await getCommand(
            testName,
            runnerJarPath,
            githubCredentials
        );
        fs.appendFileSync(EXECUTABLE_FILE, command + '\n');
    }
};

let credentials: Credentials | undefined = undefined;

const testsToRun = process.argv[2];
const jarPath = process.argv[3];
const username = process.argv[4];
const password = process.argv[5];

if (!testsToRun || !jarPath) {
    throw new Error('testsToRun and jarPath parameters are mandatory!');
}

if (username && password) {
    credentials = {
        username: username,
        pat: password
    };
}

generateExecutableFile(testsToRun, jarPath, credentials)
    .then(() => console.log('Executable file was successfully created.'))
    .catch(err => console.error(err.message, err));

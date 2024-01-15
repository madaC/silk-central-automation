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
    getModifiedCSVBytes,
    getTestParameters,
    getTestNames,
    replaceParametersReferences,
    getResultsFolder,
    ROOT_SOURCES_FOLDER,
    getRunnerJarAbsolutePath,
    getSilkTestHomeDir,
    getSourcesFolder
} from '../utils/files.js';
import fs from 'fs';
import path from 'node:path';
import {
    getAppModuleBySourceType,
    getAttachmentContentByName,
    getOctaneTestByName
} from '../utils/octaneClient.js';
import OctaneApplicationModule from '../model/octane/octaneApplicationModule';
import OctaneTest from '../model/octane/octaneTest';
import format from "dateformat";
import {TestFields} from "../model/testFields.js";

const getCommand = async (
    octaneTestName: string,
    test: OctaneTest
): Promise<string> => {
    const keywordsJsonAttachmentContent: Buffer | undefined =
        await getAttachmentContentByName(
            test,
            'SC_keywords.json'
        );
    if (!keywordsJsonAttachmentContent) {
        throw new Error(
            `keywords.json attachment is missing for Octane test with id ${test.id}`
        );
    }
    const rootWorkingFolder = getSourcesFolder(test);
    const absoluteRootWorkingFolder = path.resolve(rootWorkingFolder);
    fs.mkdirSync(rootWorkingFolder, { recursive: true });
    fs.writeFileSync(
        `${rootWorkingFolder}/keywords.json`,
        JSON.stringify(
            JSON.parse(keywordsJsonAttachmentContent.toString()),
            null,
            2
        )
    );

    const libraryAppModule: OctaneApplicationModule =
        await getAppModuleBySourceType(test, 'library');
    const libraryZipAttachmentContent: Buffer | undefined =
        await getAttachmentContentByName(libraryAppModule, 'library.zip');
    if (!libraryZipAttachmentContent) {
        throw new Error(
            `library.zip attachment is missing for Octane test with id ${test.id}`
        );
    }
    fs.writeFileSync(
        `${rootWorkingFolder}/library.zip`,
        libraryZipAttachmentContent
    );
    const dependenciesAbsolutePath = path.resolve('dependencies');

    const commandArray: string[] = [];
    commandArray.push("java");
    commandArray.push("-cp");
    commandArray.push(`"${getRunnerJarAbsolutePath()};${dependenciesAbsolutePath}${path.sep}*"`);
    commandArray.push(getJavaLibraryPath());
    commandArray.push("com.microfocus.adm.almoctane.migration.plugin_silk_central.kdt.EngineWrapper")
    commandArray.push(`"${absoluteRootWorkingFolder}"`)
    commandArray.push(`"${octaneTestName}"`)

    return commandArray.join(' ');
};

const generateExecutableFile = async (
    testsToRun: string,
    suiteId: string,
    suiteRunId: string
): Promise<void> => {
    cleanUpWorkingFiles();
    fs.mkdirSync(ROOT_SOURCES_FOLDER);

    const testNames: string[] = getTestNames(testsToRun);
    for (const testName of testNames) {
        const test = await getOctaneTestByName(testName, TestFields.KDT);
        const command = await getCommand(testName, test);

        const testContainerAppModule: OctaneApplicationModule =
            await getAppModuleBySourceType(test, 'test container');
        const timestamp: string = format(Date.now(), "yyyy-mm-dd_HH-MM-ss-ll");
        const environmentParams = getEnvironmentVariables();
        let parameters: Map<string, string>[] = await getTestParameters(test, testContainerAppModule, suiteId,
            suiteRunId, timestamp, undefined);
        const rootWorkingFolder = getSourcesFolder(test);

        parameters = await replaceParametersReferences(
            parameters,
            environmentParams
        );

        let modifiedCSVContent = await getModifiedCSVBytes(parameters);

        fs.writeFileSync(
            `${rootWorkingFolder}/SC_parameters.csv`,
            modifiedCSVContent
        );

        let isLastIteration: boolean | undefined;
        let iterationIndex: number | undefined;
        for (let i = 0; i < parameters.length; i++) {
            if (parameters.length > 1) {
                isLastIteration = i == parameters.length - 1;
                iterationIndex = i;
            }
            if (parameters.length > 1) {
                fs.appendFileSync(EXECUTABLE_FILE,`set #sctm_test_results_dir=${path.resolve(getResultsFolder(test, timestamp, iterationIndex))}\n`);
            } else {
                fs.appendFileSync(EXECUTABLE_FILE, `set #sctm_test_results_dir=${path.resolve(getResultsFolder(test, timestamp, undefined))}\n`);
            }
            fs.appendFileSync(EXECUTABLE_FILE, `${command} ${timestamp} ${isLastIteration ?? ''} ${iterationIndex ?? ''}` + '\n');
        }

    }
};

const getJavaLibraryPath = (): string => {
    const silkTestKDTPath =
        getSilkTestHomeDir() + path.sep + 'KeywordDrivenTesting';

    return `-Djava.library.path="${silkTestKDTPath}"`;
};

const testsToRun = process.argv[2];
const suiteId = process.argv[3];
const suiteRunId = process.argv[4];

generateExecutableFile(testsToRun, suiteId, suiteRunId)
    .then(() => console.log('Executable file was successfully created.'))
    .catch(err => console.error(err.message, err));

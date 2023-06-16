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
    getModifiedCSVBytes, getParameters,
    getRootWorkingFolder, getTestNames,
    replaceParametersFromCSV
} from './utils/files.js';
import fs from 'fs';
import path from 'node:path';
import {
    getApplicationModuleIds,
    getAppModuleFromIdsBySourceType,
    getAttachmentContentById,
    getAttachmentFromIdsByName,
    getAttachmentIds,
    getOctaneKDTByName
} from './utils/octaneClient.js';
import OctaneAttachment from './model/octane/octaneAttachment';
import OctaneApplicationModule from './model/octane/octaneApplicationModule';
import OctaneTest from './model/octane/octaneTest';

const getCommand = async (
    octaneTestName: string,
    runnerJarPath: string,
    test: OctaneTest
): Promise<string> => {
    const testAttachmentsIds = getAttachmentIds(test.attachments!);
    const keywordsJsonAttachment: OctaneAttachment | undefined =
        await getAttachmentFromIdsByName(
            testAttachmentsIds,
            'SC_keywords.json'
        );
    if (!keywordsJsonAttachment) {
        throw new Error(
            `keywords.json attachment is missing for Octane test with id ${test.id}`
        );
    }
    const keywordsJsonAttachmentContent = await getAttachmentContentById(
        Number.parseInt(keywordsJsonAttachment!.id)
    );
    const rootWorkingFolder = getRootWorkingFolder(test);
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
    const assignedAppModulesIds = getApplicationModuleIds(
        test.application_modules!
    );
    const libraryAppModule: OctaneApplicationModule =
        await getAppModuleFromIdsBySourceType(assignedAppModulesIds, 'library');
    const libraryAttachmentsIds = getAttachmentIds(
        libraryAppModule.attachments!
    );
    const libraryZipAttachment: OctaneAttachment | undefined =
        await getAttachmentFromIdsByName(libraryAttachmentsIds, 'library.zip');
    if (!libraryZipAttachment) {
        throw new Error(
            `library.zip attachment is missing for Octane test with id ${test.id}`
        );
    }
    const libraryZipAttachmentContent = await getAttachmentContentById(
        Number.parseInt(libraryZipAttachment!.id)
    );
    fs.writeFileSync(
        `${rootWorkingFolder}/library.zip`,
        libraryZipAttachmentContent
    );
    const dependenciesAbsolutePath = path.resolve('dependencies');

    //this should always be in one line
    return `java -cp "${runnerJarPath};${dependenciesAbsolutePath}${path.sep}*" ${getJavaLibraryPath()} com.microfocus.adm.almoctane.migration.plugin_silk_central.kdt.EngineWrapper ${absoluteRootWorkingFolder} ${octaneTestName}`;
};

const generateExecutableFile = async (
    testsToRun: string,
    runnerJarPath: string,
    suiteId: string,
    suiteRunId: string
): Promise<void> => {
    cleanUpWorkingFiles();

    const testNames: string[] = getTestNames(testsToRun);
    for (const testName of testNames) {
        const test = await getOctaneKDTByName(testName);
        const command = await getCommand(testName, runnerJarPath, test);

        const assignedAppModulesIds = getApplicationModuleIds(
            test.application_modules!
        );
        const testContainerAppModule: OctaneApplicationModule =
            await getAppModuleFromIdsBySourceType(
                assignedAppModulesIds,
                'test container'
            );
        const environmentParams = getEnvironmentVariables();
        let iterations: { [key: string]: string }[] = await getParameters(test, testContainerAppModule, suiteId,
            suiteRunId, undefined);
        const rootWorkingFolder = getRootWorkingFolder(test);

        iterations = await replaceParametersFromCSV(
            iterations,
            environmentParams
        );

        let modifiedCSVContent = await getModifiedCSVBytes(iterations);

        fs.writeFileSync(
            `${rootWorkingFolder}/SC_parameters.csv`,
            modifiedCSVContent
        );

        let isLastIteration: boolean | undefined;
        for (let i = 0; i < iterations.length; i++) {
            if (iterations.length > 1) {
                isLastIteration = i == iterations.length - 1;
            }
            fs.appendFileSync(EXECUTABLE_FILE, `${command} ${iterations.length > 1 ? i : ''} ${isLastIteration ?? ''}` + '\n');
        }

    }
};

const getJavaLibraryPath = (): string => {
    const silkTestKDTPath =
        process.env.OPEN_AGENT_HOME + path.sep + 'KeywordDrivenTesting';

    return `-Djava.library.path="${silkTestKDTPath}"`;
};

const testsToRun = process.argv[2];
const jarPath = process.argv[3];
const suiteId = process.argv[4];
const suiteRunId = process.argv[5];

if (!testsToRun || !jarPath) {
    throw new Error('testsToRun and jarPath parameters are mandatory!');
}

generateExecutableFile(testsToRun, jarPath, suiteId, suiteRunId)
    .then(() => console.log('Executable file was successfully created.'))
    .catch(err => console.error(err.message, err));

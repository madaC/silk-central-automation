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
    getRootWorkingFolder,
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
import csv from 'csvtojson';
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

    return `java -cp "${runnerJarPath};${dependenciesAbsolutePath}${path.sep}*"
     ${getJavaLibraryPath()} com.microfocus.adm.almoctane.migration.plugin_silk_central.kdt.EngineWrapper 
     ${absoluteRootWorkingFolder} ${octaneTestName}`;
};

const generateExecutableFile = async (
    testsToRun: string,
    runnerJarPath: string
): Promise<void> => {
    cleanUpWorkingFiles();

    const testNames = testsToRun.substring(1).split('+');
    for (const testName of testNames) {
        const test = await getOctaneKDTByName(testName);
        const testAttachmentsIds = getAttachmentIds(test.attachments!);

        const command = await getCommand(testName, runnerJarPath, test);

        const csvParametersAttachment: OctaneAttachment | undefined =
            await getAttachmentFromIdsByName(
                testAttachmentsIds,
                'SC_parameters.csv'
            );

        const environmentParams = getEnvironmentVariables();
        const rootWorkingFolder = getRootWorkingFolder(test);

        if (csvParametersAttachment) {
            const csvParametersAttachmentContent =
                await getAttachmentContentById(
                    Number.parseInt(csvParametersAttachment!.id)
                );

            let iterations: { [key: string]: string }[] =
                await csv().fromString(
                    csvParametersAttachmentContent.toString()
                );
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
                    if (i == iterations.length - 1) {
                        isLastIteration = true;
                    } else {
                        isLastIteration = false;
                    }
                }
                fs.appendFileSync(EXECUTABLE_FILE, `${command} ${iterations.length > 1 ? i : ''} ${isLastIteration ?? ''}` + '\n');
            }
        } else {
            fs.appendFileSync(EXECUTABLE_FILE, command + '\n');
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

if (!testsToRun || !jarPath) {
    throw new Error('testsToRun and jarPath parameters are mandatory!');
}

generateExecutableFile(testsToRun, jarPath)
    .then(() => console.log('Executable file was successfully created.'))
    .catch(err => console.error(err.message, err));

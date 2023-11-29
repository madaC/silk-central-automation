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
    getResultsFolder,
    getSilkTestHomeDir,
    getTestNames,
    ROOT_SOURCES_FOLDER
} from '../utils/files.js';
import OctaneTest from '../model/octane/octaneTest.js';
import {
    deserializeSourceControlDetails,
    getAppModuleBySourceType,
    getOctaneTestByName
} from '../utils/octaneClient.js';
import {TestFields} from '../model/testFields.js';
import OctaneApplicationModule from '../model/octane/octaneApplicationModule';
import path from 'node:path';
import Credentials from '../model/credentials.js';
import STWProfile from '../model/silk/STWProfile.js';
import fs from 'fs';
import format from 'dateformat';

const generateExecutableFile = async (
    testsToRun: string,
    dbCredentials: Credentials,
    STWCredentials?: Credentials
): Promise<void> => {
    cleanUpWorkingFiles();

    const testNames: string[] = getTestNames(testsToRun);
    for (const testName of testNames) {
        const test: OctaneTest = await getOctaneTestByName(
            testName,
            TestFields.STW
        );
        const testContainerAppModule: OctaneApplicationModule =
            await getAppModuleBySourceType(test, 'test container');
        const stwProfile = <STWProfile> deserializeSourceControlDetails(testContainerAppModule.sc_source_control_udf)!;

        stwProfile.dbUser = dbCredentials.username;
        stwProfile.dbPassword = dbCredentials.password;

        stwProfile.STWUser = STWCredentials?.username;
        stwProfile.STWPassword = STWCredentials?.password;

        const rootWorkingFolder = `${ROOT_SOURCES_FOLDER}/source_control_${stwProfile.id}`;
        fs.mkdirSync(rootWorkingFolder, {recursive: true});

        await stwProfile.fetchResources(rootWorkingFolder);

        const command = await getCommand(stwProfile, test);
        fs.appendFileSync(EXECUTABLE_FILE, command + '\n');
    }
};

const getCommand = async (
    STWProfile: STWProfile,
    octaneTest: OctaneTest
): Promise<string> => {
    let commandArray: string[] = [];
    commandArray.push(`"${getSilkTestHomeDir()}/gui/STW.exe"`);
    commandArray.push('-createdsn'); // add check for SCTM_STWB_DSN parameter or environment variable
    const STWDatabaseEncryptedXmlAbsolutePath = path.resolve(
        `${ROOT_SOURCES_FOLDER}/source_control_${STWProfile.id}/TP.xml`
    );
    commandArray.push(`"${STWDatabaseEncryptedXmlAbsolutePath}"`);
    if (STWProfile.STWUser) {
        commandArray.push('-username');
        commandArray.push(STWProfile.STWUser);
        commandArray.push('-password');
        commandArray.push(STWProfile.STWPassword!);
    }
    commandArray.push('-resultdir');
    const timestamp: string = format(Date.now(), 'yyyy-mm-dd_HH-MM-ss-ll');
    commandArray.push(
        `"${path.resolve(getResultsFolder(octaneTest, timestamp, undefined))}"`
    );

    const scriptInfo: string[] = octaneTest.sc_script_name_udf.split('/');
    const projectName = scriptInfo[1];
    const script = scriptInfo[3];

    commandArray.push('-project');
    commandArray.push(projectName);

    commandArray.push('-script');
    commandArray.push(script);

    commandArray.push('-novariablevalidation'); //check for parameters

    return commandArray.join(' ');
};

let dbCredentials: Credentials | undefined = undefined;
let STWCredentials: Credentials | undefined = undefined;
const testsToRun = process.argv[2];
const dbUser = process.argv[3];
const dbPassword = process.argv[4];
const STWUser = process.argv[5];
const STWPassword = process.argv[6];

if (dbUser && dbPassword) {
    dbCredentials = {
        username: dbUser,
        password: dbPassword
    };
} else {
    throw new Error(
        'Missing Credentials! Silk Test Workbench database credentials not found.'
    );
}

if (STWUser && STWPassword) {
    STWCredentials = {
        username: STWUser,
        password: STWPassword
    };
}

generateExecutableFile(testsToRun, dbCredentials, STWCredentials)
    .then(() => console.log('Executable file was successfully created.'))
    .catch(err => console.error(err.message, err));

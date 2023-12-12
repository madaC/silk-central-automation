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
    getResultsFolder,
    getSilkTestHomeDir,
    getTestNames,
    getTestParameters,
    replaceParametersReferences,
    replaceParamsValuesInSTWTest,
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

const SPECIFIC_DSN_PARAMETER = 'SCTM_STWB_DSN';
const generateExecutableFile = async (
    testsToRun: string,
    suiteId: string,
    suiteRunId: string,
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
        const stwProfile = <STWProfile>deserializeSourceControlDetails(testContainerAppModule.sc_source_control_udf)!;

        stwProfile.dbUser = dbCredentials.username;
        stwProfile.dbPassword = dbCredentials.password;

        stwProfile.STWUser = STWCredentials?.username;
        stwProfile.STWPassword = STWCredentials?.password;

        const rootWorkingFolder = `${ROOT_SOURCES_FOLDER}/source_control_${stwProfile.id}`;
        const timestamp: string = format(Date.now(), 'yyyy-mm-dd_HH-MM-ss-ll');
        const environmentParams = getEnvironmentVariables();
        fs.mkdirSync(rootWorkingFolder, {recursive: true});

        await stwProfile.fetchResources(rootWorkingFolder);

        let parameters: Map<string, string>[] = await getTestParameters(test, testContainerAppModule, suiteId,
            suiteRunId, timestamp, stwProfile);

        const iterationsWithReplacedParams = await replaceParametersReferences(
            parameters,
            environmentParams
        );

        let iterationIndex: number | undefined;
        for (let i = 0; i < iterationsWithReplacedParams.length; i++) {
            const iteration = iterationsWithReplacedParams[i];
            replaceParamsValuesInSTWTest(iteration, environmentParams, test);

            if (iterationsWithReplacedParams.length > 1) {
                iterationIndex = i;
            }
            const command = await getCommand(
                stwProfile,
                test,
                iteration,
                timestamp,
                iterationIndex
            );
            fs.appendFileSync(EXECUTABLE_FILE, command + '\n');
        }
    }
};

const getCommand = async (
    STWProfile: STWProfile,
    octaneTest: OctaneTest,
    parameters: Map<string, string>,
    timestamp: string,
    iterationIndex: number | undefined
): Promise<string> => {
    let commandArray: string[] = [];
    commandArray.push(`"${getSilkTestHomeDir()}/gui/STW.exe"`);

    const specificDSN = parameters.get(SPECIFIC_DSN_PARAMETER);
    if (specificDSN) {
        commandArray.push('-dsn')
        commandArray.push()
    } else {
        commandArray.push('-createdsn');
        const STWDatabaseEncryptedXmlAbsolutePath = path.resolve(`${ROOT_SOURCES_FOLDER}/source_control_${STWProfile.id}/TP.xml`);
        commandArray.push(`"${STWDatabaseEncryptedXmlAbsolutePath}"`)
    }

    if (STWProfile.STWUser) {
        commandArray.push('-username');
        commandArray.push(STWProfile.STWUser);
        commandArray.push('-password');
        commandArray.push(STWProfile.STWPassword!);
    }
    commandArray.push('-resultdir');
    commandArray.push(`"${path.resolve(getResultsFolder(octaneTest, timestamp, iterationIndex))}"`);

    const scriptInfo: string[] = octaneTest.sc_script_name_udf.split('/');
    const projectName = scriptInfo[1];
    const script = scriptInfo[3];

    commandArray.push('-project');
    commandArray.push(projectName);

    commandArray.push('-script');
    commandArray.push(script);

    commandArray.push('-novariablevalidation');
    parameters.forEach((value, key) => {
        commandArray.push("-variable")
        commandArray.push(`"${key}=${value}"`)
    });

    return commandArray.join(' ');
};

let dbCredentials: Credentials | undefined = undefined;
let STWCredentials: Credentials | undefined = undefined;
const testsToRun = process.argv[2];
const suiteId = process.argv[3];
const suiteRunId = process.argv[4];
const dbUser = process.argv[5];
const dbPassword = process.argv[6];
const STWUser = process.argv[7];
const STWPassword = process.argv[8];

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
} else {
    STWCredentials = {
        username: 'Admin',
        password: 'admin'
    }
}

generateExecutableFile(testsToRun, suiteId, suiteRunId, dbCredentials, STWCredentials)
    .then(() => console.log('Executable file was successfully created.'))
    .catch(err => console.error(err.message, err));

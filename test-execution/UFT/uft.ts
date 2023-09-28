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
import {ROOT_SOURCES_FOLDER} from "../utils/files.js";
import {xml2json} from "xml-js";
import OctaneApplicationModule from "../model/octane/octaneApplicationModule";
import {deserializeSourceControlDetails, getAppModuleBySourceType, getUFTOctaneTestByName} from "../utils/octaneClient.js";
import SourceControlProfile from "../model/silk/sourceControlProfile";
import Credentials from "../model/credentials";
import OctaneTest from "../model/octane/octaneTest";
import fs from "fs";


const createResources = async (
    testsToRunConverted: string,
    suiteId: string,
    suiteRunId: string,
    credentials?: Credentials
): Promise<void> => {

    const mtbxAsJson: string = xml2json(testsToRunConverted, {compact: true, spaces: 1}).replaceAll("\\\\", "\\\\\\\\");
    const mtbx = JSON.parse(mtbxAsJson);
    let array = mtbx.Mtbx.Test;
    if (!Array.isArray(mtbx.Mtbx.Test)) {
        array = new Array(array);
    }
    for (const test of array) {
        const testName = test._attributes.name
        const classname = test._attributes.name.substring(0, test._attributes.name.lastIndexOf("\\\\"))
        const octaneUFTTest: OctaneTest = await getUFTOctaneTestByName(testName, classname);

        const testContainerAppModule: OctaneApplicationModule =
            await getAppModuleBySourceType(octaneUFTTest, 'test container');
        const sourceControlProfile: SourceControlProfile | undefined =
            deserializeSourceControlDetails(
                testContainerAppModule.sc_source_control_udf
            );

        if (sourceControlProfile) {
            fs.mkdirSync(ROOT_SOURCES_FOLDER);
            const rootWorkingFolder = `${ROOT_SOURCES_FOLDER}/source_control_${sourceControlProfile.id}`;
            await sourceControlProfile!.fetchResources(
                rootWorkingFolder,
                credentials
            );
        }
    }
}

const testsToRunConverted = process.argv[2];
const suiteId = process.argv[3];
const suiteRunId = process.argv[4];
const username = process.argv[5];
const password = process.argv[6];

if (!testsToRunConverted) {
    throw new Error('testsToRunConverted parameter is mandatory!');
}

let credentials: Credentials | undefined = undefined;
if (username && password) {
    credentials = {
        username: username,
        pat: password
    };
}

createResources(testsToRunConverted, suiteId, suiteRunId, credentials)
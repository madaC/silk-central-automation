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
import OctaneTest from '../model/octane/octaneTest';

const ROOT_SOURCES_FOLDER = 'test_sources';
const TEST_RESULT_FILE = 'testResults';
const EXECUTABLE_FILE = 'command_to_execute.bat';
const KDT_EXECUTION_FOLDER = 'execution_files';

const cleanUpWorkingFiles = (): void => {
    if (fs.existsSync(EXECUTABLE_FILE)) {
        fs.unlinkSync(EXECUTABLE_FILE);
    }

    if (fs.existsSync(TEST_RESULT_FILE)) {
        fs.rmdirSync(TEST_RESULT_FILE, { recursive: true });
    }

    if (fs.existsSync(ROOT_SOURCES_FOLDER)) {
        fs.rmdirSync(ROOT_SOURCES_FOLDER, { recursive: true });
    }

    if (fs.existsSync(KDT_EXECUTION_FOLDER)) {
        fs.rmdirSync(KDT_EXECUTION_FOLDER, { recursive: true });
    }

    if (fs.existsSync(TEST_RESULT_FILE)) {
        fs.mkdirSync(ROOT_SOURCES_FOLDER);
    }
};

const getRootWorkingFolder = (test: OctaneTest): string => {
    return `${ROOT_SOURCES_FOLDER}/${test.id}_test_source`;
};

export {
    cleanUpWorkingFiles,
    getRootWorkingFolder,
    ROOT_SOURCES_FOLDER,
    TEST_RESULT_FILE,
    EXECUTABLE_FILE
};

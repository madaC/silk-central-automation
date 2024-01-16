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
import xml2js, { parseString } from 'xml2js';
import fs from 'fs-extra';
import { TEST_RESULT_FILE } from '../utils/files.js';
import format from 'dateformat';
import TestCase from '../model/silk/testCase';

const xmlBuilder = new xml2js.Builder();

const convertTestResultsToOctaneFormat = async (): Promise<void> => {
    const testSuite: {testsuite: TestCase[]} = {
        testsuite: []
    };
    const files = fs.readdirSync(TEST_RESULT_FILE);
    for (const file of files) {
        const octaneTestName: string = file
            .toString()
            .substring(
                file.toString().indexOf('/') + 1,
                file.toString().indexOf(format(Date.now(), 'yyyy-mm-dd').toString()) - 1
            );
        const name: string = TEST_RESULT_FILE + '/' + file;
        const xmlInfoFiles = getAllFilesFromDir(name).filter(file => file.endsWith('.Info.xml'));
        const testCase = await getTestCase(xmlInfoFiles, octaneTestName);
        testSuite.testsuite.push(testCase);
    }
    const resultsXml: string = xmlBuilder.buildObject(testSuite);
    fs.writeFileSync(`${TEST_RESULT_FILE}/Results.xml`, resultsXml);
};

const getAllFilesFromDir = (
    dir: string,
    allFilesList: string[] = []
): string[] => {
    const files: string[] = fs.readdirSync(dir);
    files.map(file => {
        const name: string = dir + '/' + file;
        if (fs.statSync(name).isDirectory()) {
            getAllFilesFromDir(name, allFilesList);
        } else {
            allFilesList.push(name);
        }
    });

    return allFilesList;
};

const parseXmlStringToObject = (xmlString: string): Promise<Object> => {
    return new Promise((resolve, reject) => {
        parseString(
            xmlString,
            { explicitArray: false, explicitRoot: false },
            (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            }
        );
    });
};

const getTestCase = async (
    files: string[],
    octaneTestName: string
): Promise<TestCase> => {
    const testResult: TestCase = {
        testcase: {
            $: {
                name: octaneTestName,
                classname: ''
            }
        }
    };

    let errorMessage: string = '';
    for (const file of files) {
        const xmlContent: string = fs.readFileSync(file, 'utf-8');
        const result: any = await parseXmlStringToObject(xmlContent);
        if (result.playbackErrorString) {
            errorMessage = errorMessage + result.playbackErrorString;
        }
    }

    if (errorMessage != '') {
        testResult.testcase.error = {
            $: { message: errorMessage }
        };
    }

    return testResult;
};

if (fs.existsSync(TEST_RESULT_FILE)) {
    convertTestResultsToOctaneFormat()
        .then(() =>
            console.log(
                'Silk Test Workbench results were successfully converted to Octane expected format'
            )
        )
        .catch(err => console.error(err.message, err));
} else {
    console.log(
        "Couldn't generate converted result file! testResults folder does not exist."
    );
}

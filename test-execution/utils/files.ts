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
const paramRegex = /\${([\S]+?)}/;
const KDT_EXECUTION_FOLDER = 'execution_files';

const cleanUpWorkingFiles = (): void => {
    if (fs.existsSync(EXECUTABLE_FILE)) {
        fs.unlinkSync(EXECUTABLE_FILE);
    }

    if (fs.existsSync(TEST_RESULT_FILE)) {
        fs.rmdirSync(TEST_RESULT_FILE, {recursive: true});
    }

    if (fs.existsSync(ROOT_SOURCES_FOLDER)) {
        fs.rmdirSync(ROOT_SOURCES_FOLDER, {recursive: true});
    }

    if (fs.existsSync(KDT_EXECUTION_FOLDER)) {
        fs.rmdirSync(KDT_EXECUTION_FOLDER, {recursive: true});
    }

    fs.mkdirSync(ROOT_SOURCES_FOLDER);
};

const getRootWorkingFolder = (test: OctaneTest): string => {
    return `${ROOT_SOURCES_FOLDER}/${test.id}_test_source`;
};

const replaceParametersFromCSV = async (
    iterations: { [key: string]: string }[],
    envParams: { [key: string]: string }
): Promise<{ [key: string]: string }[]> => {
    for (let iteration of iterations) {
        for (let param in iteration) {
            iteration[param] = replaceParamValue(
                iteration[param],
                iteration,
                envParams,
                []
            );
        }
    }

    return iterations;
};

const replaceParamValue = (
    val: string,
    iteration: { [key: string]: string },
    envParams: { [key: string]: string },
    prevParams: string[]
): string => {
    let found = val.match(paramRegex);
    if (found == null) {
        return val;
    }
    let paramName = found[1];
    let paramValue = iteration[paramName];
    if (!paramValue) {
        if (envParams[paramName]) {
            paramValue = envParams[paramName]!;
        }
        if (envParams[paramName.toUpperCase()]) {
            paramValue = envParams[paramName.toUpperCase()]!;
        }
        if (envParams[paramName.toLowerCase()]) {
            paramValue = envParams[paramName.toLowerCase()]!;
        }

    }
    if (paramValue != undefined && !prevParams.includes(paramName)) {
        let copyOfPrevParams = prevParams.slice();

        copyOfPrevParams.push(paramName);
        let index = val.indexOf(found[0]) + found[0].length;
        //concatenation is needed for the cases when there are multiple calls to parameters in the same parameter value (e.g ${p1}${p2})
        return `${val
            .substring(0, index)
            .replace(
                found[0],
                replaceParamValue(
                    paramValue,
                    iteration,
                    envParams,
                    copyOfPrevParams
                )
            )}${replaceParamValue(
            val.substring(index),
            iteration,
            envParams,
            prevParams
        )}`;
    } else {
        let index = val.indexOf(found[0]) + found[0].length;
        //the first part of the concatenation represents a call to a parameter that does not exist (e.g. ${nonExistentParameter})
        return `${val.substring(0, index)}${replaceParamValue(
            val.substring(index),
            iteration,
            envParams,
            prevParams
        )}`;
    }
};

const replaceParamsValuesInNunitTest = (
    iteration: { [key: string]: string },
    envParams: { [key: string]: string },
    test: OctaneTest
): OctaneTest => {
    const result = {
        ...test,
        sc_nunit_assembly_udf: replaceParamValue(
            test.sc_nunit_assembly_udf!,
            iteration,
            envParams,
            []
        )
    };
    if (result.sc_nunit_options_udf) {
        result.sc_nunit_options_udf = replaceParamValue(
            result.sc_nunit_options_udf,
            iteration,
            envParams,
            []
        );
    }
    if (result.sc_nunit_directory_udf) {
        result.sc_nunit_directory_udf = replaceParamValue(
            result.sc_nunit_directory_udf,
            iteration,
            envParams,
            []
        );
    }
    return result;
};
const getEnvironmentVariables = (): { [key: string]: string } => {
    let envParams: { [key: string]: string } = {};
    for (let envParam in process.env) {
        let envParamValue = process.env[envParam];
        envParams[envParam] = envParamValue!;
    }
    return envParams;
};
const replaceParamsValuesInJunitTest = (
    iteration: { [key: string]: string },
    envParams: { [key: string]: string },
    test: OctaneTest
): OctaneTest => {
    const result = {
        ...test,
        sc_classpath_udf: replaceParamValue(
            test.sc_classpath_udf!,
            iteration,
            envParams,
            []
        )
    };
    if (result.sc_method_name_udf) {
        result.sc_method_name_udf = replaceParamValue(
            result.sc_method_name_udf,
            iteration,
            envParams,
            []
        );
    }
    if (result.sc_class_names_udf) {
        result.sc_class_names_udf = replaceParamValue(
            result.sc_class_names_udf,
            iteration,
            envParams,
            []
        );
    }
    return result;
};


async function getModifiedCSVBytes(iterationsWithReplacedParams: { [p: string]: string }[]) {

    let csvString = "";
    for (let param in iterationsWithReplacedParams[0]) {
        csvString = `${csvString}${param},`;
    }
    csvString = `${csvString.substring(0, csvString.length - 1)}`;
    for (let iteration of iterationsWithReplacedParams) {
        csvString = `${csvString}\n`;
        for (let param in iteration) {
            csvString = `${csvString}${iteration[param]},`;
        }
        csvString = `${csvString.substring(0, csvString.length - 1)}`;
    }
    return Buffer.from(csvString);

}

export {
    cleanUpWorkingFiles,
    getRootWorkingFolder,
    replaceParametersFromCSV,
    replaceParamsValuesInNunitTest,
    replaceParamsValuesInJunitTest,
    getEnvironmentVariables,
    getModifiedCSVBytes,
    ROOT_SOURCES_FOLDER,
    TEST_RESULT_FILE,
    EXECUTABLE_FILE
};

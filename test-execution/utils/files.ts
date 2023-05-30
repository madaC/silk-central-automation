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
import csv from 'csvtojson';

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
        fs.rmdirSync(TEST_RESULT_FILE, { recursive: true });
    }

    if (fs.existsSync(ROOT_SOURCES_FOLDER)) {
        fs.rmdirSync(ROOT_SOURCES_FOLDER, { recursive: true });
    }

    if (fs.existsSync(KDT_EXECUTION_FOLDER)) {
        fs.rmdirSync(KDT_EXECUTION_FOLDER, { recursive: true });
    }

    fs.mkdirSync(ROOT_SOURCES_FOLDER);
};

const getRootWorkingFolder = (test: OctaneTest): string => {
    return `${ROOT_SOURCES_FOLDER}/${test.id}_test_source`;
};

const replaceParametersFromCSV = async (
    iterations: { [key: string]: string }[]
): Promise<{ [key: string]: string }[]> => {
    for (let iteration of iterations) {
        for (let envParam in process.env) {
            let envParamValue = process.env[envParam];
            if (envParamValue != undefined) {
                if (!iteration[envParam]) {
                    iteration[envParam] = envParamValue;
                }
            }
        }
        for (let param in iteration) {
            iteration[param] = replaceParamValue(
                iteration[param],
                iteration,
                []
            );
        }
    }

    return iterations;
};

const replaceParamValue = (
    val: string,
    iteration: { [key: string]: string },
    prevParams: string[]
): string => {
    let found = val.match(paramRegex);
    if (found == null) {
        return val;
    }
    let paramName = found[1];
    let paramValue = iteration[paramName];
    if (paramValue != undefined && !prevParams.includes(paramName)) {
        let copyOfPrevParams = prevParams.slice();

        copyOfPrevParams.push(paramName);
        let index = val.indexOf(found[0]) + found[0].length;
        //concatenation is needed for the cases when there are multiple calls to parameters in the same parameter value (e.g ${p1}${p2})
        return `${val
            .substring(0, index)
            .replace(
                found[0],
                replaceParamValue(paramValue, iteration, copyOfPrevParams)
            )}${replaceParamValue(
            val.substring(index),
            iteration,
            prevParams
        )}`;
    } else {
        let index = val.indexOf(found[0]) + found[0].length;
        //the first part of the concatenation represents a call to a parameter that does not exist (e.g. ${nonExistentParameter})
        return `${val.substring(0, index)}${replaceParamValue(
            val.substring(index),
            iteration,
            prevParams
        )}`;
    }
};

const replaceParamsValuesInNunitTest = (
    iteration: { [key: string]: string },
    test: OctaneTest
): OctaneTest => {
    const result = {
        ...test,
        sc_nunit_assembly_udf: replaceParamValue(
            test.sc_nunit_assembly_udf!,
            iteration,
            []
        )
    };
    if (result.sc_nunit_options_udf) {
        result.sc_nunit_options_udf = replaceParamValue(
            result.sc_nunit_options_udf,
            iteration,
            []
        );
    }
    if (result.sc_nunit_directory_udf) {
        result.sc_nunit_directory_udf = replaceParamValue(
            result.sc_nunit_directory_udf,
            iteration,
            []
        );
    }
    return result;
};

const replaceParamsValuesInJunitTest = (
    iteration: { [key: string]: string },
    test: OctaneTest
): OctaneTest => {
    const result = {
        ...test,
        sc_classpath_udf: replaceParamValue(
            test.sc_classpath_udf!,
            iteration,
            []
        )
    };
    if (result.sc_method_name_udf) {
        result.sc_method_name_udf = replaceParamValue(
            result.sc_method_name_udf,
            iteration,
            []
        );
    }
    if (result.sc_class_names_udf) {
        result.sc_class_names_udf = replaceParamValue(
            result.sc_class_names_udf,
            iteration,
            []
        );
    }
    return result;
};

export {
    cleanUpWorkingFiles,
    getRootWorkingFolder,
    replaceParametersFromCSV,
    replaceParamsValuesInNunitTest,
    replaceParamsValuesInJunitTest,
    ROOT_SOURCES_FOLDER,
    TEST_RESULT_FILE,
    EXECUTABLE_FILE
};

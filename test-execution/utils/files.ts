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
import OctaneListNode from "../model/octane/octaneListNode";

import OctaneTestSuite from "../model/octane/octaneTestSuite";
import {
    getAttachmentContentByName,
    getTestSuiteById
} from "./octaneClient.js";
import csv from "csvtojson";
import OctaneApplicationModule from "../model/octane/octaneApplicationModule";
import SourceControlProfile from "../model/silk/sourceControlProfile";

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
        csvString = `${csvString}"${param}",`;
    }
    csvString = `${csvString.substring(0, csvString.length - 1)}`;
    for (let iteration of iterationsWithReplacedParams) {
        csvString = `${csvString}\n`;
        for (let param in iteration) {
            csvString = `${csvString}"${iteration[param]}",`;
        }
        csvString = `${csvString.substring(0, csvString.length - 1)}`;
    }
    return Buffer.from(csvString);

}

const getPredefinedParameters = async (
    test: OctaneTest,
    testContainerAppModule: OctaneApplicationModule,
    testSuite: OctaneTestSuite,
    suiteRunId: string,
    sourceControlProfile: SourceControlProfile | undefined
): Promise<{ [key: string]: string }> => {
    let predefinedParameters: { [key: string]: string } = {};
    predefinedParameters['#sctm_regular_execdef_run_id'] = suiteRunId;
    if (testContainerAppModule.sc_product_name_udf) {
        predefinedParameters['#sctm_product'] = testContainerAppModule.sc_product_name_udf;
    }
    if (sourceControlProfile) {
       predefinedParameters['#sctm_source_root_dir'] = sourceControlProfile.getAbsoluteWorkingFolderPath(getRootWorkingFolder(test));
    }
    let testRelatedParameters: { [key: string]: string } = getTestRelatedParameters(test);
    let testSuiteRelatedParameters: { [key: string]: string } = await getTestSuiteRelatedParameters(testSuite);

    for (let param in testRelatedParameters) {
        predefinedParameters[param] = testRelatedParameters[param];
    }

    for (let param in testSuiteRelatedParameters) {
        predefinedParameters[param] = testSuiteRelatedParameters[param];
    }

    return predefinedParameters;
}

const getTestRelatedParameters = (test: OctaneTest): { [key: string]: string } => {
    let testParameters: { [key: string]: string } = {};
    testParameters['#sctm_data_driven_parent_test_name'] = extractName(test.name);
    testParameters['#sctm_test_name'] = extractName(test.name);
    testParameters['#sctm_test_id'] = test.id;
    testParameters['#sctm_data_driven_parent_test_id'] = test.id;
    if (test.source_id_udf) {
        testParameters['#sctm_test_id'] = test.source_id_udf;
        testParameters['#sctm_data_driven_parent_test_id'] = test.source_id_udf;
    }
    if (test.external_test_id) {
        testParameters['#external_id'] = test.external_test_id;
    }
    return testParameters;
}

const getTestSuiteRelatedParameters = async (testSuite: OctaneTestSuite): Promise<{ [key: string]: string }> => {
    let testSuiteParameters: { [key: string]: string } = {};
    testSuiteParameters['#sctm_execdef_name'] = testSuite.name;
    testSuiteParameters['#sctm_execdef_id'] = testSuite.id;
    testSuiteParameters['#sctm_keywords'] = '';
    testSuiteParameters['#sctm_build'] = '';
    testSuiteParameters['#sctm_version'] = '';
    if (testSuite.source_id_udf) {
        testSuiteParameters['#sctm_execdef_id'] = testSuite.source_id_udf;
    }
    if (testSuite.sc_exec_keywords_udf && testSuite.sc_exec_keywords_udf.length > 0) {
        testSuiteParameters['#sctm_keywords'] = await getOctaneListNodesAsString(testSuite.sc_exec_keywords_udf);
    }
    if (testSuite.silk_release_build_udf) {
        testSuiteParameters['#sctm_build'] = extractBuildVersion(testSuite.silk_release_build_udf.name);
    }
    if (testSuite.silk_release_version_udf) {
        testSuiteParameters['#sctm_version'] = extractBuildVersion(testSuite.silk_release_version_udf.name);
    }

    return testSuiteParameters;
}

const getOctaneListNodesAsString = async (octaneListNodes: OctaneListNode[]): Promise<string> => {
    const octaneListNodeNames: string[] = [];
    octaneListNodes.forEach(octaneListNode => {
        octaneListNodeNames.push(octaneListNode.name);
    });
    return octaneListNodeNames.join(",");
}

const extractName = (octaneTestName: string): string => {
    let lastIndexOfUnderscore = octaneTestName.lastIndexOf("_");
    if (lastIndexOfUnderscore == -1) {
        return octaneTestName;
    }
    return octaneTestName.substring(0, lastIndexOfUnderscore);
}

const extractBuildVersion = (name: string): string => {
    let lastIndexOfUnderscore = name.lastIndexOf(" ");
    if (lastIndexOfUnderscore == -1 || lastIndexOfUnderscore == name.length - 1) {
        return name;
    }
    return name.substring(lastIndexOfUnderscore + 1);
}

const getParameters = async (
    test: OctaneTest | OctaneTestSuite,
    attachmentName: string
): Promise<{ [key: string]: string }> => {
    let parameters: { [key: string]: string } = {};
    const csvParametersAttachmentContent: Buffer | undefined =
        await getAttachmentContentByName(test, attachmentName);

    if (csvParametersAttachmentContent) {
        let iterations: { [key: string]: string }[] = await csv().fromString(
            csvParametersAttachmentContent.toString()
        );
        if (iterations[0] !== undefined) {
            parameters = iterations[0];
        }
    }

    return parameters;
}

const mergeParameters = (
    predefinedParameters: { [key: string]: string },
    execPlanParameters: { [key: string]: string },
    customParameters: { [key: string]: string }
): { [key: string]: string } => {
    let mergedParameters: { [key: string]: string } = customParameters;
    for (let param in execPlanParameters) {
        mergedParameters[param] = execPlanParameters[param];
    }
    for (let param in predefinedParameters) {
        mergedParameters[param] = predefinedParameters[param];
    }

    return mergedParameters;
}

const getTestParameters = async (test: OctaneTest,
                                 testContainerAppModule: OctaneApplicationModule,
                                 suiteId: string,
                                 suiteRunId: string,
                                 sourceControlProfile: SourceControlProfile | undefined
): Promise<{ [key: string]: string }[]> => {
    let testSuite: OctaneTestSuite = await getTestSuiteById(suiteId);
    let predefinedParams: { [key: string]: string } = await getPredefinedParameters(test, testContainerAppModule,
        testSuite, suiteRunId, sourceControlProfile);
    let execPlanParameters: { [key: string]: string } = await getParameters(testSuite, 'SC_parameters.csv');
    let customParameters: { [key: string]: string } = await getParameters(test, 'SC_custom_parameters.csv');
    let mergedParameters: { [key: string]: string } = mergeParameters(
        predefinedParams,
        execPlanParameters,
        customParameters
    );
    const csvParametersAttachmentContent: Buffer | undefined =
        await getAttachmentContentByName(
            test,
            'SC_dataset.csv'
        );


    let iterations: { [key: string]: string }[] = [];

    if (csvParametersAttachmentContent && test.sc_enable_data_driven_udf !== undefined
    && test.sc_enable_data_driven_udf) {
        iterations = await csv().fromString(
            csvParametersAttachmentContent.toString()
        );

        let addIterationName: boolean = iterations.length > 1;
        for (let i = 0; i < iterations.length; i++) {
            const iteration = iterations[i];
            for (let predefinedParam in mergedParameters) {
                iteration[predefinedParam] = mergedParameters[predefinedParam];
            }
            if (addIterationName) {
                iteration["#sctm_test_name"] = i + ' (' + iteration["#sctm_test_name"] + ')';
            }
        }

    } else {
        iterations.push(mergedParameters);
    }

    return iterations;
}

const getTestNames = (testsToRun: string): string[] => {
    const tests: string[] = testsToRun.split('||');
    const testNames: string[] = [];
    tests.forEach(test => {
        const testProperties: string[] = test.split('|');
        if (testProperties.length > 1) {
            testNames.push(testProperties[0]);
        }
    });
    return testNames;
};


export {
    cleanUpWorkingFiles,
    getRootWorkingFolder,
    replaceParametersFromCSV,
    replaceParamsValuesInNunitTest,
    replaceParamsValuesInJunitTest,
    getEnvironmentVariables,
    getModifiedCSVBytes,
    getPredefinedParameters,
    getTestParameters,
    getTestNames,
    ROOT_SOURCES_FOLDER,
    TEST_RESULT_FILE,
    EXECUTABLE_FILE
};

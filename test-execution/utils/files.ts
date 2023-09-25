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
import OctaneListNode from '../model/octane/octaneListNode';

import OctaneTestSuite from '../model/octane/octaneTestSuite';
import {
    getAttachmentContentByName,
    getTestSuiteById
} from './octaneClient.js';
import csv from 'csvtojson';
import OctaneApplicationModule from '../model/octane/octaneApplicationModule';
import SourceControlProfile from '../model/silk/sourceControlProfile';
import path from 'path';

const ROOT_SOURCES_FOLDER = 'test_sources';
const TEST_RESULT_FILE = 'testResults';
const EXECUTABLE_FILE = 'command_to_execute.bat';
const DEFAULT_VM_ARGS = '-Xmx128m';
const paramRegex = /\${([\S]+?)}/;

const cleanUpWorkingFiles = (): void => {
    if (fs.existsSync(EXECUTABLE_FILE)) {
        fs.unlinkSync(EXECUTABLE_FILE);
    }

    if (fs.existsSync(TEST_RESULT_FILE)) {
        fs.rmSync(TEST_RESULT_FILE, { recursive: true });
    }

    if (fs.existsSync(ROOT_SOURCES_FOLDER)) {
        fs.rmSync(ROOT_SOURCES_FOLDER, { recursive: true });
    }
};

const getSourcesFolder = (test: OctaneTest): string => {
    return `${ROOT_SOURCES_FOLDER}/${test.id}_test_source`;
};

const getResultsFolder = (
    test: OctaneTest,
    timestamp: string,
    iterationIndex: number | undefined
): string => {
    if (iterationIndex != undefined) {
        return `${TEST_RESULT_FILE}/${test.name}_${timestamp}/${test.name}_iteration${iterationIndex}`;
    } else return `${TEST_RESULT_FILE}/${test.name}_${timestamp}`;
};

const replaceParametersReferences = async (
    iterations: Map<string, string>[],
    envParams: Map<string, string>
): Promise<Map<string, string>[]> => {
    iterations.forEach((iteration: Map<string, string>) => {
        iteration.forEach((value, key) => {
            iteration.set(
                key,
                replaceParamValue(iteration.get(key)!, iteration, envParams, [])
            );
        });
    });

    return iterations;
};

const replaceParamValue = (
    val: string,
    iteration: Map<string, string>,
    envParams: Map<string, string>,
    prevParams: string[]
): string => {
    let found = val.match(paramRegex);
    if (found == null) {
        return val;
    }
    let paramName = found[1];
    let paramValue = iteration.get(paramName);
    if (!paramValue) {
        if (envParams.get(paramName)) {
            paramValue = envParams.get(paramName);
        }
        if (envParams.get(paramName.toUpperCase())) {
            paramValue = envParams.get(paramName.toUpperCase());
        }
        if (envParams.get(paramName.toLowerCase())) {
            paramValue = envParams.get(paramName.toLowerCase());
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
    iteration: Map<string, string>,
    envParams: Map<string, string>,
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
const getEnvironmentVariables = (): Map<string, string> => {
    let envParams: Map<string, string> = new Map<string, string>();
    for (let envParam in process.env) {
        let envParamValue = process.env[envParam];
        envParams.set(envParam, envParamValue!);
    }
    return envParams;
};
const replaceParamsValuesInJunitTest = (
    iteration: Map<string, string>,
    envParams: Map<string, string>,
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

const replaceParamsValuesInProcessExecutorTest = (
    iteration: Map<string, string>,
    envParams: Map<string, string>,
    test: OctaneTest
): OctaneTest => {
    const result = {
        ...test,
        sc_executable_name_udf: replaceParamValue(
            test.sc_executable_name_udf!,
            iteration,
            envParams,
            []
        )
    };
    if (result.sc_argument_list_udf) {
        result.sc_argument_list_udf = replaceParamValue(
            result.sc_argument_list_udf,
            iteration,
            envParams,
            []
        );
    }
    if (result.sc_working_folder_udf) {
        result.sc_working_folder_udf = replaceParamValue(
            result.sc_working_folder_udf,
            iteration,
            envParams,
            []
        );
    }
    if (result.sc_junit_result_udf) {
        result.sc_junit_result_udf = replaceParamValue(
            result.sc_junit_result_udf,
            iteration,
            envParams,
            []
        );
    }
    return result;
};

async function getModifiedCSVBytes(
    iterationsWithReplacedParams: Map<string, string>[]
) {
    let csvString = '';
    for (let param in iterationsWithReplacedParams[0]) {
        csvString = `${csvString}"${param}",`;
    }
    csvString = `${csvString.substring(0, csvString.length - 1)}`;
    for (let iteration of iterationsWithReplacedParams) {
        csvString = `${csvString}\n`;
        for (let param in iteration) {
            csvString = `${csvString}"${iteration.get(param)}",`;
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
    timestamp: string,
    sourceControlProfile: SourceControlProfile | undefined
): Promise<Map<string, string>> => {
    let predefinedParameters: Map<string, string> = new Map<string, string>();
    predefinedParameters.set('#sctm_regular_execdef_run_id', suiteRunId);
    if (
        test.source_type_udf === 'process executor test' ||
        test.source_type_udf === 'keyword driven test'
    ) {
        predefinedParameters.set(
            '#sctm_exec_sourcesfolder',
            path.resolve(getResultsFolder(test, timestamp, undefined))
        );
    } else {
        predefinedParameters.set(
            '#sctm_exec_sourcesfolder',
            path.resolve(getSourcesFolder(test))
        );
    }
    if (testContainerAppModule.sc_product_name_udf) {
        predefinedParameters.set(
            '#sctm_product',
            testContainerAppModule.sc_product_name_udf
        );
    }
    if (sourceControlProfile) {
        predefinedParameters.set(
            '#sctm_source_root_dir',
            sourceControlProfile.getAbsoluteWorkingFolderPath(
                getSourcesFolder(test)
            )
        );
    }
    let testRelatedParameters: Map<string, string> =
        getTestRelatedParameters(test);
    let testSuiteRelatedParameters: Map<string, string> =
        await getTestSuiteRelatedParameters(testSuite);

    testRelatedParameters.forEach((value, key) => {
        predefinedParameters.set(key, testRelatedParameters.get(key)!);
    });

    testSuiteRelatedParameters.forEach((value, key) => {
        predefinedParameters.set(key, testSuiteRelatedParameters.get(key)!);
    });

    return predefinedParameters;
};

const getTestRelatedParameters = (test: OctaneTest): Map<string, string> => {
    let testParameters: Map<string, string> = new Map<string, string>();
    testParameters.set(
        '#sctm_data_driven_parent_test_name',
        extractName(test.name)
    );
    testParameters.set('#sctm_test_name', extractName(test.name));
    testParameters.set('#sctm_test_id', test.id);
    testParameters.set('#sctm_data_driven_parent_test_id', test.id);
    if (test.source_id_udf) {
        testParameters.set('#sctm_test_id', test.source_id_udf);
        testParameters.set(
            '#sctm_data_driven_parent_test_id',
            test.source_id_udf
        );
    }
    if (test.external_test_id) {
        testParameters.set('#external_id', test.external_test_id);
    }
    return testParameters;
};

const getTestSuiteRelatedParameters = async (
    testSuite: OctaneTestSuite
): Promise<Map<string, string>> => {
    let testSuiteParameters: Map<string, string> = new Map<string, string>();
    testSuiteParameters.set('#sctm_execdef_name', testSuite.name);
    testSuiteParameters.set('#sctm_execdef_id', testSuite.id);
    testSuiteParameters.set('#sctm_keywords', '');
    testSuiteParameters.set('#sctm_build', '');
    testSuiteParameters.set('#sctm_version', '');
    if (testSuite.source_id_udf) {
        testSuiteParameters.set('#sctm_execdef_id', testSuite.source_id_udf);
    }
    if (
        testSuite.sc_exec_keywords_udf &&
        testSuite.sc_exec_keywords_udf.length > 0
    ) {
        testSuiteParameters.set(
            '#sctm_keywords',
            await getOctaneListNodesAsString(testSuite.sc_exec_keywords_udf)
        );
    }
    if (testSuite.silk_release_build_udf) {
        testSuiteParameters.set(
            '#sctm_build',
            extractBuildVersion(testSuite.silk_release_build_udf.name)
        );
    }
    if (testSuite.silk_release_version_udf) {
        testSuiteParameters.set(
            '#sctm_version',
            extractBuildVersion(testSuite.silk_release_version_udf.name)
        );
    }

    return testSuiteParameters;
};

const getOctaneListNodesAsString = async (
    octaneListNodes: OctaneListNode[]
): Promise<string> => {
    const octaneListNodeNames: string[] = [];
    octaneListNodes.forEach(octaneListNode => {
        octaneListNodeNames.push(octaneListNode.name);
    });
    return octaneListNodeNames.join(',');
};

const extractName = (octaneTestName: string): string => {
    let lastIndexOfUnderscore = octaneTestName.lastIndexOf('_');
    if (lastIndexOfUnderscore == -1) {
        return octaneTestName;
    }
    return octaneTestName.substring(0, lastIndexOfUnderscore);
};

const extractBuildVersion = (name: string): string => {
    let lastIndexOfUnderscore = name.lastIndexOf(' ');
    if (
        lastIndexOfUnderscore == -1 ||
        lastIndexOfUnderscore == name.length - 1
    ) {
        return name;
    }
    return name.substring(lastIndexOfUnderscore + 1);
};

const getParameters = async (
    test: OctaneTest | OctaneTestSuite,
    attachmentName: string
): Promise<Map<string, string>> => {
    let parameters: Map<string, string> = new Map<string, string>();
    const csvParametersAttachmentContent: Buffer | undefined =
        await getAttachmentContentByName(test, attachmentName);

    if (csvParametersAttachmentContent) {
        const iterations = await getCsvAsMapArray(
            csvParametersAttachmentContent
        );
        if (iterations[0] !== undefined) {
            parameters = iterations[0];
        }
    }

    return parameters;
};

const mergeParameters = (
    predefinedParameters: Map<string, string>,
    execPlanParameters: Map<string, string>,
    customParameters: Map<string, string>
): Map<string, string> => {
    let mergedParameters: Map<string, string> = customParameters;
    execPlanParameters.forEach((value, key) => {
        mergedParameters.set(key, execPlanParameters.get(key)!);
    });

    predefinedParameters.forEach((value, key) => {
        mergedParameters.set(key, predefinedParameters.get(key)!);
    });

    return mergedParameters;
};

const getTestParameters = async (
    test: OctaneTest,
    testContainerAppModule: OctaneApplicationModule,
    suiteId: string,
    suiteRunId: string,
    timestamp: string,
    sourceControlProfile: SourceControlProfile | undefined
): Promise<Map<string, string>[]> => {
    let testSuite: OctaneTestSuite = await getTestSuiteById(suiteId);
    let predefinedParams: Map<string, string> = await getPredefinedParameters(
        test,
        testContainerAppModule,
        testSuite,
        suiteRunId,
        timestamp,
        sourceControlProfile
    );
    let execPlanParameters: Map<string, string> = await getParameters(
        testSuite,
        'SC_parameters.csv'
    );
    let customParameters: Map<string, string> = await getParameters(
        test,
        'SC_custom_parameters.csv'
    );
    let mergedParameters: Map<string, string> = mergeParameters(
        predefinedParams,
        execPlanParameters,
        customParameters
    );
    const csvParametersAttachmentContent: Buffer | undefined =
        await getAttachmentContentByName(test, 'SC_dataset.csv');

    let iterations: Map<string, string>[] = [];

    if (
        csvParametersAttachmentContent &&
        test.sc_enable_data_driven_udf !== undefined &&
        test.sc_enable_data_driven_udf
    ) {
        const iterations = await getCsvAsMapArray(
            csvParametersAttachmentContent
        );

        let testHasIterations: boolean = iterations.length > 1;
        for (let i = 0; i < iterations.length; i++) {
            const iteration = iterations[i];
            mergedParameters.forEach((value, key) => {
                iteration.set(key, mergedParameters.get(key)!);
            });
            if (testHasIterations) {
                iteration.set(
                    '#sctm_test_name',
                    i + ' (' + iteration.get('#sctm_test_name') + ')'
                );
                if (
                    test.source_type_udf === 'process executor test' ||
                    test.source_type_udf === 'keyword driven test'
                ) {
                    iteration.set(
                        '#sctm_exec_sourcesfolder',
                        path.resolve(getResultsFolder(test, timestamp, i))
                    );
                }
            }
        }
    } else {
        iterations.push(mergedParameters);
    }

    return iterations;
};

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

const getJavaExecutablePath = (test: OctaneTest): string => {
    if (test.sc_java_home_udf) {
        return `${test.sc_java_home_udf}${path.sep}bin${path.sep}java`;
    } else return 'java';
};

const getJVMOptions = (test: OctaneTest): string => {
    if (test.sc_jvm_options_udf) {
        return test.sc_jvm_options_udf.replace(/\s\s+/g, ' ');
    } else {
        return DEFAULT_VM_ARGS;
    }
};

const getCsvAsMapArray = async (
    csvAttachment: Buffer
): Promise<Map<string, string>[]> => {
    const options = {
        flatKeys: true
    };

    const csvAsArray: object[] = await csv(options).fromString(
        csvAttachment.toString()
    );

    return csvAsArray.map(iterationObj => {
        const iteration = new Map<string, string>();
        for (const [key, value] of Object.entries(iterationObj)) {
            iteration.set(key, value);
        }
        return iteration;
    });
};

export {
    cleanUpWorkingFiles,
    getSourcesFolder,
    replaceParametersReferences,
    replaceParamsValuesInNunitTest,
    replaceParamsValuesInJunitTest,
    getEnvironmentVariables,
    getModifiedCSVBytes,
    getPredefinedParameters,
    getTestParameters,
    getTestNames,
    getOctaneListNodesAsString,
    replaceParamsValuesInProcessExecutorTest,
    getResultsFolder,
    getJavaExecutablePath,
    getJVMOptions,
    ROOT_SOURCES_FOLDER,
    TEST_RESULT_FILE,
    EXECUTABLE_FILE
};

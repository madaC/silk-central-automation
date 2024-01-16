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
export const TestFields = {
    JUnit: ['name', 'external_test_id', 'sc_class_names_udf', 'sc_method_name_udf', 'sc_classpath_udf',
        'application_modules', 'attachments', 'sc_enable_data_driven_udf', 'source_type_udf', 'sc_java_home_udf', 'sc_jvm_options_udf'],
    NUnit: ['name', 'external_test_id', 'sc_nunit_assembly_udf', 'sc_nunit_directory_udf', 'sc_nunit_options_udf',
        'application_modules', 'attachments', 'sc_enable_data_driven_udf', 'source_type_udf', 'sc_java_home_udf', 'sc_jvm_options_udf'],
    KDT: ['name', 'external_test_id', 'attachments', 'application_modules', 'sc_enable_data_driven_udf', 'source_type_udf'],
    ProcessExecutor: ['name', 'sc_executable_name_udf', 'external_test_id', 'sc_argument_list_udf', 'sc_working_folder_udf',
        'sc_junit_result_udf', 'sc_enable_data_driven_udf', 'attachments', 'application_modules', 'source_type_udf'],
    UFT: ['name', 'attachments', 'application_modules', 'sc_enable_data_driven_udf'],
    STW: ['name', 'sc_script_name_udf', 'sc_playback_opt_udf', 'attachments', 'application_modules', 'sc_enable_data_driven_udf']
}

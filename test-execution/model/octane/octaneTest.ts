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
import OctaneApplicationModule from "./octaneApplicationModule";
import OctaneAttachment from "./octaneAttachment";

export default interface OctaneTest {
    id: string;
    name: string;
    source_id_udf?: string;
    external_test_id?: string;
    sc_class_names_udf?: string;
    sc_method_name_udf?: string;
    sc_classpath_udf?: string;
    sc_nunit_options_udf?: string;
    sc_nunit_assembly_udf?: string;
    sc_nunit_directory_udf?: string;
    sc_enable_data_driven_udf?: boolean;
    application_modules?: OctaneApplicationModule[];
    attachments?: OctaneAttachment[];
    sc_executable_name_udf?: string,
    sc_argument_list_udf?: string,
    sc_working_folder_udf?: string,
    sc_junit_result_udf?: string,
    source_type_udf: string,
    sc_java_home_udf: string,
    sc_jvm_options_udf: string
}

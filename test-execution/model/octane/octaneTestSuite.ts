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
import OctaneListNode from "./octaneListNode";
import OctaneAttachment from "./octaneAttachment";

export default interface OctaneTestSuite {
    id: string;
    name: string;
    source_id_udf?: string;
    silk_release_build_udf?: OctaneListNode;
    silk_release_version_udf?: OctaneListNode;
    sc_exec_keywords_udf?: OctaneListNode[];
    attachments?: OctaneAttachment[];
}
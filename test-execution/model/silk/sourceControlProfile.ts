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
import Credentials from '../credentials';

export default abstract class SourceControlProfile {
    protected name: string;
    protected Type?: string;
    protected _rootNode?: string;

    abstract createClasspathFolder(
        rootWorkingFolder: string,
        credentials?: Credentials
    ): void;

    abstract getAbsoluteWorkingFolderPath(rootWorkingFolder: string): string;

    protected constructor(name: string, pluginClass: string, rootNode: string) {
        this.name = name;
        this.Type = pluginClass;
        this._rootNode = rootNode;
    }

}

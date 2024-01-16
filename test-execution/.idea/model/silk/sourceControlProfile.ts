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
import {ROOT_SOURCES_FOLDER} from "../../utils/files.js";

export default abstract class SourceControlProfile {
    public id: string;
    public name: string;
    private _Type: string;
    public _rootNode?: string;
    public WorkingFolder: string;

    abstract fetchResources(credentials?: Credentials): void;

    abstract getAbsoluteWorkingFolderPath(): string;

    protected constructor(
        id: string,
        name: string,
        type: string,
        rootNode: string,
        workingFolder: string
    ) {
        this.id = id;
        this.name = name;
        this._Type = type;
        this._rootNode = rootNode;
        this.WorkingFolder = workingFolder;
    }

    get Type(): string {
        return this._Type;
    }

    set Type(value: string) {
        this._Type = value;
    }

    getRootWorkingFolder = (): string => {
        return `${ROOT_SOURCES_FOLDER}/SourceControlProfile_${this.id}`;
    };
}

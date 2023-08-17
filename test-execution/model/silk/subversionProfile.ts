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
import SourceControlProfile from './sourceControlProfile.js';
import Credentials from '../credentials';
import path from 'path';
import {svnCheckout} from '../../utils/shellUtils/subversion.js';

export default class SubversionProfile extends SourceControlProfile {
    private readonly _projectPath?: string;
    private readonly _url: string;

    constructor(
        name: string,
        type: string,
        rootNode: string,
        projectPath: string,
        url: string,
        workingFolder: string
    ) {
        super(name, type, rootNode, workingFolder);
        this._projectPath = projectPath;
        this._url = url;
    }

    get url(): string {
        return this._url.replace(/\\/g, '/');
    }

    createClasspathFolder(
        rootWorkingFolder: string,
        credentials: Credentials
    ): void {
        svnCheckout(this._url, rootWorkingFolder, credentials);
    }

    getAbsoluteWorkingFolderPath(rootWorkingFolder: string): string {
        return path.resolve(
            `${rootWorkingFolder}/${this._projectPath}/${this._rootNode}`
        );
    }
}

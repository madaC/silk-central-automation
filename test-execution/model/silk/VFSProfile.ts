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
import path from 'node:path';
import fs from 'fs-extra';
import axios from "axios";
import AdmZip from "adm-zip";


export default class VFSProfile extends SourceControlProfile {
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

    async createClasspathFolder(
        rootWorkingFolder: string,
        credentials?: Credentials
    ): Promise<void> {
        if (this._url.startsWith('smb:')) {
            const url = this._url.split('smb:')[1];
            fs.copySync(`${url}`, `${rootWorkingFolder}`, {overwrite: true});
        } else {
            if (this._url.startsWith('zip:http')) {
                let zipUrl = this._url.split('zip:')[1];
                const zipName = zipUrl.substring(zipUrl.lastIndexOf('/') + 1);
                fs.mkdirSync(rootWorkingFolder, {recursive: true});

                const res = await axios.get(zipUrl, {responseType: 'stream' });
                const fileStream = fs.createWriteStream(`${rootWorkingFolder}/${zipName}`);
                try {
                    await new Promise((resolve, reject) => {

                        res.data!.pipe(fileStream);
                        res.data!.on("error", reject);
                        fileStream.on("finish", resolve);
                    })
                } catch(err) {
                    console.log(err)
                }
                const zip = new AdmZip(`./${rootWorkingFolder}/${zipName}`);
                zip.extractAllTo(rootWorkingFolder , true);
            }
        }
    }

    getAbsoluteWorkingFolderPath(rootWorkingFolder: string): string {
        return path.resolve(
            `${rootWorkingFolder}/${this._projectPath}/${this._rootNode}`
        );
    }
}

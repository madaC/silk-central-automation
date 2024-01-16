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
import Credentials from '../credentials.js';
import xml2js from 'xml2js';
import fs from 'fs';
import path from "path";
import {encrypt} from "../../utils/security.js";

export default class STWProfile extends SourceControlProfile {
    private _dbType: string;
    private _dbServer: string;
    private _dbName: string;
    private _dbPort: string;
    private _dbSchema: string;
    private _dbUser: string | undefined;
    private _dbPassword: string | undefined;
    private _STWUser: string | undefined;
    private _STWPassword: string | undefined;

    constructor(
        id: string,
        name: string,
        type: string,
        dbType: string,
        dbServer: string,
        dbName: string,
        dbPort: string,
        dbSchema: string
    ) {
        super(id, name, type, '', '');
        this._dbType = dbType;
        this._dbServer = dbServer;
        this._dbName = dbName;
        this._dbPort = dbPort;
        this._dbSchema = dbSchema;
    }

    get dbType(): string {
        return this._dbType;
    }

    set dbType(value: string) {
        this._dbType = value;
    }

    get dbServer(): string {
        return this._dbServer;
    }

    set dbServer(value: string) {
        this._dbServer = value;
    }

    get dbName(): string {
        return this._dbName;
    }

    set dbName(value: string) {
        this._dbName = value;
    }

    get dbPort(): string {
        return this._dbPort;
    }

    set dbPort(value: string) {
        this._dbPort = value;
    }

    get dbSchema(): string {
        return this._dbSchema;
    }

    set dbSchema(value: string) {
        this._dbSchema = value;
    }

    get dbUser(): string | undefined {
        return this._dbUser;
    }

    set dbUser(value: string | undefined) {
        this._dbUser = value;
    }

    get dbPassword(): string | undefined {
        return this._dbPassword;
    }

    set dbPassword(value: string | undefined) {
        this._dbPassword = value;
    }

    get STWUser(): string | undefined {
        return this._STWUser;
    }

    set STWUser(value: string | undefined) {
        this._STWUser = value;
    }

    get STWPassword(): string | undefined {
        return this._STWPassword;
    }

    set STWPassword(value: string | undefined) {
        this._STWPassword = value;
    }

    fetchResources(credentials?: Credentials): void {
        const xmlBuilder = new xml2js.Builder();
        const STWDatabase = {
            TPDatabase: {
                tpDBType: this.dbType,
                tpDBServer: this.dbServer,
                tpDBName: this.dbName,
                tpDBPort: this.dbPort,
                tpDBSchema: this.dbSchema,
                tpDBUser: this.dbUser,
                tpDBPwd: this.dbPassword,
                tpTPUser: this.STWUser,
                tpTPPwd: this.STWPassword
            }
        };
        const encryptionKey = [5, -21, 3, 5, -43, 9, 6, 127, 12, 64, 91, -31, -12, 77, 32, 17];
        const encryptionAlgorithm = "des-ede-cbc";

        const STWDatabaseXML = xmlBuilder.buildObject(STWDatabase);
        const STWDatabaseXMLEncrypted = encrypt(STWDatabaseXML, encryptionAlgorithm, new Uint8Array(8), Buffer.from(encryptionKey));

        fs.mkdirSync(this.getRootWorkingFolder(), {recursive: true});
        fs.writeFileSync(
            `${this.getRootWorkingFolder()}/TP.xml`,
            STWDatabaseXMLEncrypted
        );
    }

    getAbsoluteWorkingFolderPath(): string {
       return path.resolve(this.getRootWorkingFolder());
    }
}

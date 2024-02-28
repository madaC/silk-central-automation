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
import PropertiesReader from "properties-reader";
import {encrypt} from "./utils/security.js";

const ENCRYPTION_ALGORITHM = 'aes192';
const ENCRYPTION_KEY = 'migrationSecretKey192bit';
const ENCRYPTED_PASSWORD_PREFIX = "ENCR:";

const octaneCredentials = PropertiesReader('./octane-details.properties')
const password = octaneCredentials.get('password')?.toString() || '';
const user = octaneCredentials.get('user')?.toString() || '';

if (user && password) {
    const encryptedPassword = encrypt(
        password,
        ENCRYPTION_ALGORITHM,
        new Int8Array(16),
        Buffer.from(ENCRYPTION_KEY)
    );
    const encryptedUser = encrypt(
        user,
        ENCRYPTION_ALGORITHM,
        new Int8Array(16),
        Buffer.from(ENCRYPTION_KEY)
    );
    const octaneDetails = fs.readFileSync('octane-details.properties', 'utf8');
    const octaneDetailsReplaced = octaneDetails
        .replaceAll(password, ENCRYPTED_PASSWORD_PREFIX + encryptedPassword)
        .replaceAll(user, ENCRYPTED_PASSWORD_PREFIX + encryptedUser);
    fs.writeFileSync('octane-details.properties', octaneDetailsReplaced);
} else {
    console.log(
        'Missing value for Octane username or Octane password in octane-details.properties!'
    );
}

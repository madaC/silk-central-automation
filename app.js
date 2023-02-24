import fs from 'fs';
import PropertiesReader from 'properties-reader'
import shell from "shelljs";
import {Octane, Query} from "@microfocus/alm-octane-js-rest-sdk";
import * as path from "path";

const properties = PropertiesReader("./octane-details.properties");

const octane = new Octane({
    server: properties.get("octane-url"),
    sharedSpace: properties.get("sharedspace"),
    workspace: properties.get("workspace"),
    user: properties.get("user"),
    password: properties.get("password")
})

const getOctaneTestByName = async (testName) => {
    try {
        const query = Query.field('name').equal(testName).and(Query.field('class_name').equal(Query.NULL)).and(Query.field('package').equal(Query.NULL)).and(Query.field('component').equal(Query.NULL))
        return await octane.get(Octane.entityTypes.tests).fields('name', 'sc_class_names_udf', 'sc_method_name_udf', 'sc_classpath_udf', 'sc_branch_udf', 'sc_configuration_type_udf', 'sc_repo_url_udf', 'sc_project_path_udf').query(query.build()).execute();
    } catch (e) {
        console.log('caught error', e)
    }
}

const getCommand = async (octaneTestName, runnerJarPath) => {
    const test = await getOctaneTestByName(octaneTestName);
    validateTest(test)
    const urlRepo = test.data[0].sc_repo_url_udf.replace(/\\/g, "/")
    const branchName = test.data[0].sc_branch_udf
    const folderName = urlRepo.substring(urlRepo.lastIndexOf("/") + 1)

    createClasspathFolder(urlRepo, branchName, folderName)
    const projectPath = test.data[0].sc_project_path_udf != null ? test.data[0].sc_project_path_udf.replace(/\\/g, "/") : '';
    const classpath = test.data[0].sc_classpath_udf.replace(/\\/g, "/")

    const rootClasspath = './' + folderName + projectPath
    const totalClasspath = getTotalClasspath(rootClasspath, classpath)
    const methodName = test.data[0].sc_method_name_udf;
    const classNames = test.data[0].sc_class_names_udf

    return createCommand(methodName, octaneTestName, classNames, totalClasspath, runnerJarPath);
}

const createCommand = (methodName, octaneTestName, classNames, totalClasspath, runnerJarPath) => {
    let command;
    if (methodName === null && classNames == null) {
        command = 'java -cp "' + totalClasspath + ";" + runnerJarPath + '" com.microfocus.adm.almoctane.migration.plugin_silk_central.JUnitCmdLineWrapper ' + "RunMeAsAJar" + ' ' + null + ' ' + octaneTestName
    } else if (methodName === null && classNames != null && classNames.split(" ").length > 0) {
        command = 'java -cp "' + totalClasspath + ";" + runnerJarPath + '" com.microfocus.adm.almoctane.migration.plugin_silk_central.JUnitCmdLineWrapper "' + classNames + '" ' + null + ' ' + octaneTestName
    } else if (methodName != null && classNames != null && classNames.split(" ").length > 0) {
        command = 'java -cp "' + totalClasspath + ";" + runnerJarPath + '" com.microfocus.adm.almoctane.migration.plugin_silk_central.JUnitCmdLineWrapper "' + classNames + '" ' + methodName + ' ' + octaneTestName
    } else {
        throw new Error('Could not create execution command for test with name' + octaneTestName)
    }

    return command;
}

const validateTest = (test, testName) => {
    if (typeof (test.data[0]) === "undefined") {
        throw new Error('Could not get Octane automated test with name ' + testName)
    }
    if (test.data[0].sc_repo_url_udf === null) {
        throw new Error('SC Repo URL udf has empty value for Octane automated test with with name' + testName)
    }
    if (test.data[0].sc_classpath_udf === null) {
        throw new Error('SC Project path udf has empty value for Octane automated test with with name' + testName)
    }
}

const getTotalClasspath = (rootClasspath, classpath) => {
    const jarPaths = classpath.split(';')
    let testsClasspath = "";
    jarPaths.forEach(function (value) {
        if (value.startsWith('./')) {
            testsClasspath += path.resolve(rootClasspath + value.substring(1, value.length)) + ";"
        } else {
            testsClasspath += value.startsWith('/') ? path.resolve(rootClasspath + value) + ";" : path.resolve(rootClasspath + '/' + value) + ";"
        }
    });
    return testsClasspath.substring(0, testsClasspath.lastIndexOf(';'))
}

const createClasspathFolder = (urlRepo, branchName, folderName) => {
    try {
        if (!fs.existsSync("./" + folderName)) {
            shell.exec('git clone ' + urlRepo)
            if (branchName != null) {
                shell.cd(folderName)
                shell.exec('git checkout ' + branchName)
                shell.exec('git pull ' + urlRepo + " " + branchName)
                shell.cd('../')
            }
        } else {
            if (branchName === null) {
                shell.cd(folderName)
                let branches = shell.exec('git branch').toString()
                if (branches.indexOf('master') > -1) {
                    shell.exec('git checkout master')
                    shell.exec('git pull master')
                } else {
                    shell.exec('git checkout main')
                    shell.exec('git pull main')
                }
                shell.cd('../')
            } else {
                shell.cd(folderName)
                shell.exec('git checkout ' + branchName)
                shell.exec('git pull ' + urlRepo + " " + branchName)
                shell.cd('../')
            }
        }
    } catch (e) {
        console.log("Could not fetch test jars")
    }
}

const getExecutableFile = async (testsToRun, runnerJarPath) => {
    const testNames = testsToRun.substring(1).split('+')
    if (fs.existsSync('./command_to_execute.bat')) {
        fs.unlinkSync('./command_to_execute.bat')
    }

    if (fs.existsSync('./testResults')) {
        fs.rmdirSync('./testResults', {recursive: true})
    }

    for (const testName of testNames) {
        const command = await getCommand(testName, runnerJarPath)
        fs.appendFileSync('./command_to_execute.bat', command + "\n")


    }
}

getExecutableFile(process.env.testsToRunConverted, process.env.runnerJarPath)










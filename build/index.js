"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
let TestRail = require('./test-rail');
let titleToCaseIds = require('mocha-testrail-reporter/dist/lib/shared').titleToCaseIds;
let Status = require('mocha-testrail-reporter/dist/lib/testrail.interface').Status;
const _reporter = _interopRequireDefault(require("@wdio/reporter"));
const fs = require('fs');


const failedTestDirPath = `${__dirname}/failedTests`;

function clearFailedState() {
  fs.existsSync(failedTestDirPath) && fs.rmdirSync(failedTestDirPath, {recursive: true});
}

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : {default: obj};
}

function titleToSuiteId(title) {
  const match = title.match(/\bT?S(\d+)\b/g);
  if (!match) {
    console.warn(`Suite id is not detected in test name`);
    return null;
  }
  return match[0];
}

function fullTitleToBrowserName(fullTitle) {
  const regex = /<-(.*)->/g;
  const match = regex.exec(fullTitle);
  if (!match) {
    throw new Error(`Browser name is not detected in full test name`);
  }
  return match[1];
}

class TestRailReporter extends _reporter.default {
  constructor(options) {
    /**
     * make spec reporter to write to output stream by default
     */
    options = Object.assign({
      stdout: true
    }, options);

    super(options); // Keep track of the order that suites were called

    fs.existsSync(failedTestDirPath) || fs.mkdirSync(failedTestDirPath);

    this.stateCounts = {
      passed: 0,
      failed: 0,
      skipped: 0
    };
    this._results = {};
    this._passes = 0;
    this._fails = 0;
    this._pending = 0;
    this._out = [];
    this.testRail = new TestRail(options);
  }

  /**
   * @param {{title}} test
   * @return {string}
   */
  getRunComment(test) {
    let comment = test.title;
    return comment;
  }

  /**
   * @param {{caps}} capabilities
   * @return {string}
   */
  getCapabilitiesStr(caps) {
    const browser = caps.browserName || caps.browser;
    return `${caps.os ? caps.os + ' ' : ''}${caps.os_version ? caps.os_version + ', ' : ''}${caps.device ? caps.device + ', ' : ''}${browser ? browser + ' ' : ''} ${caps.browser_version ? caps.browser_version + ', ' : ''}${caps['browserstack.geoLocation'] ? caps['browserstack.geoLocation'] : ''}`;
  }

  onTestPass(test) {
    let caseIds = titleToCaseIds(test.title);
    const failedTests = fs.readdirSync(failedTestDirPath);
    if (failedTests.some(failedTest => caseIds.includes(Number(failedTest)))) {
      return;
    }
    this.stateCounts.passed++;
    this._passes++;
    this._out.push(test.title + ': pass');
    let suiteId = titleToSuiteId(test.fullTitle) || this.options.suiteId;
    if (!suiteId) {
      return;
    }
    if (caseIds.length > 0) {
      let results = caseIds.map(caseId => {
        return {
          case_id: caseId,
          status_id: Status.Passed,
          comment: `${this.getRunComment(test)}`,
          browserName: fullTitleToBrowserName(test.fullTitle),
        };
      });
      this._results[suiteId] = this._results[suiteId] || [];
      this._results[suiteId].unshift(...results);
    }
  }

  onTestFail(test) {
    let caseIds = titleToCaseIds(test.title);
    caseIds.forEach(caseId => fs.writeFileSync(`${failedTestDirPath}/${caseId}`, ''))
    this._fails++;
    this._out.push(test.title + ': fail');
    let suiteId = titleToSuiteId(test.fullTitle) || this.options.suiteId;
    if (!suiteId) {
      return;
    }
    if (caseIds.length > 0) {
      let results = caseIds.map(caseId => {
        return {
          case_id: caseId,
          status_id: Status.Failed,
          comment: `${this.getRunComment(test)}
				${test.error.message}
				${test.error.stack}
				`,
          browserName: fullTitleToBrowserName(test.fullTitle),
        };
      });
      this._results[suiteId] = this._results[suiteId] || [];
      this._results[suiteId].push(...results);
    }
  }

  onTestSkip(test) {
    this.stateCounts.skipped++;
    this._pending++;
    this._out.push(test.title + ': skipped');
    let caseIds = titleToCaseIds(test.title);
    let suiteId = titleToSuiteId(test.fullTitle) || this.options.suiteId;
    if (!suiteId) {
      return;
    }
    if (caseIds.length > 0) {
      let results = caseIds.map(caseId => {
        return {
          case_id: caseId,
          status_id: Status.Retest,
          comment: `${this.getRunComment(test)}`,
          browserName: fullTitleToBrowserName(test.fullTitle),
        };
      });
      this._results[suiteId] = this._results[suiteId] || [];
      this._results[suiteId].push(...results);
    }
  }

  onRunnerEnd(runner) {
    if (this._results.length == 0) {
      console.warn("No testcases were matched. Ensure that your tests are declared correctly and matches TCxxx\n" +
        "You may use script generate-cases to do it automatically.");
      return;
    }
    let executionDateTime = new Date();
    let descriptionData = {
      passed: this._passes,
      failed: this._fails,
      pending: this._pending,
      total: this._passes + this._fails + this._pending,
    };

    for (let suiteId in this._results) {
      this.testRail.publish(executionDateTime, this.options.runName, descriptionData, suiteId.replace('S', ''), this._results[suiteId]);
    }
  }
}

var _default = TestRailReporter;
exports.default = _default;
module.exports.clearFailedState = clearFailedState;

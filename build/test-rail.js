const request = require("sync-request");
const fs = require("fs");

/**
 * TestRail basic API wrapper
 */
class TestRail {

  /**
   * @param {{domain, projectId, suiteId, assignedToId, username, password, timestamp}} options
   */
  constructor(options) {
    this._validate(options, 'domain');
    this._validate(options, 'username');
    this._validate(options, 'password');
    this._validate(options, 'projectId');
    this._validate(options, 'timestamp');

    // compute base url
    this.options = options;
    this.base = `https://${options.domain}/index.php`;
    this.runIdPath = `${__dirname}/${this._getTimestamp()}`;
  }


  /**
   * @return {string}
   * @private
   */
  _getTimestamp() {
    return fs.existsSync(`${__dirname}/timestamp`)
      ? fs.readFileSync(`${__dirname}/timestamp`).toString()
      : (fs.writeFileSync(`${__dirname}/timestamp`, this.options.timestamp), this.options.timestamp);
  }

  /**
   * @param {{}} options
   * @param {string} name
   * @private
   */
  _validate(options, name) {
    if (options == null) {
      throw new Error("Missing testRailsOptions in wdio.conf");
    }
    if (options[name] == null) {
      throw new Error(`Missing ${name} value. Please update testRailsOptions in wdio.conf`);
    }
  }

  /**
   * @param {string} path
   * @return {string}
   * @private
   */
  _url(path) {
    return `${this.base}?${path}`;
  }

  /**
   * @callback callback
   * @param {{}}
   */

  /**
   * @param {string} api
   * @param {*} body
   * @param {callback} callback
   * @param {callback} error
   * @return {*}
   * @private
   */
  _post(api, body, error = undefined) {
    return this._request("POST", api, body, error);
  }

  /**
   * @param {string} api
   * @param {callback} error
   * @return {*}
   * @private
   */
  _get(api, error = undefined) {
    return this._request("GET", api, null, error);
  }

  /**
   * @param {string} method
   * @param {string} api
   * @param {*} body
   * @param {callback} callback
   * @param {callback} error
   * @return {*}
   * @private
   */
  _request(method, api, body, error = undefined) {
    let options = {
      headers: {
        "Authorization": "Basic " + new Buffer(this.options.username + ":" + this.options.password).toString("base64"),
        "Content-Type": "application/json"
      },
    };
    if (body) {
      options['json'] = body;
    }

    let result = request(method, this._url(`/api/v2/${api}`), options);
    result = JSON.parse(result.getBody('utf8'));
    if (result.error) {
      console.log("Error: %s", JSON.stringify(result.body));
      if (error) {
        error(result.error);
      } else {
        throw new Error(result.error);
      }
    }
    return result;
  }

  /**
   * @param {string} title
   * @param {number|null} parentId
   * @return {{id}}
   */
  addSection(title, parentId = null) {
    let body = {
      "suite_id": this.options.suiteId,
      "name": title,
    };
    if (parentId) {
      body['parent_id'] = parentId;
    }
    return this._post(`add_section/${this.options.projectId}`, body);
  }

  /**
   * @return {[]}
   */
  getSections() {
    return this._get(`get_sections/${this.options.projectId}&suite_id=${this.options.suiteId}`);
  }

  /**
   * @param {string} title
   * @param {number} sectionId
   * @return {{id}}
   */
  addTestCase(title, sectionId) {
    return this._post(`add_case/${sectionId}`, {
      "title": title
    });
  }

  /**
   * @param {string} name
   * @param {string} description
   * @param {string} browserName
   * @param {string} suiteId
   * @return {*}
   */
  addRun(name, description, browserName, suiteId) {
    const run = this._post(`add_run/${this.options.projectId}`, {
      "suite_id": suiteId || this.options.suiteId,
      "name": name,
      "description": description,
      "assignedto_id": this.options.assignedToId,
      "include_all": true
    });
    this.writeRunId(run.id, browserName, suiteId);
    return run.id;
  }

  /**
   * Publishes results of execution of an automated test run
   * @param {Date} executionDateTime
   * @param {string} runName
   * @param {Object} descriptionData
   * @param {string} suiteId
   * @param {[]} results
   * @param {callback} callback
   */
  publish(executionDateTime,
          runName = 'WebDriver.io test rail reporter',
          descriptionData,
          suiteId,
          results,
          callback = undefined) {
    const {passed, failed, pending, total} = descriptionData;
    let name = `${runName} on ${results[0].browserName}, ${this._getSuiteName(suiteId)}: automated test run ${executionDateTime}`;
    let description = `${name}
	  Execution summary:
	  Passes: ${passed}
  	Fails: ${failed}
	  Pending: ${pending}
	  Total: ${total}
	  `;
    this.getRunId(results[0].browserName, suiteId) || this.addRun(name, description, results[0].browserName, suiteId);
    const runId = this.getRunId(results[0].browserName, suiteId);
    if (runId === null) {
      throw new Error(`Couldn't get run id`);
    }
    console.log(`Publishing results to ${this.base}?/runs/view/${runId}`);
    let body = this.addResultsForCases(runId, results);
    // execute callback if specified
    if (callback) {
      callback(body);
    }
  }

  /**
   * @return {*}
   */
  getSuites() {
    return this._get(`get_suites/${this.options.projectId}`);
  }

  /**
   * @param {number} runId
   * @param {{case_id, status_id, comment}[]} results
   * @return {*}
   */
  addResultsForCases(runId, results) {
    return this._post(`add_results_for_cases/${runId}`, {
      results: results
    });
  }


  getRunId(browserName, suiteId) {
    const path = this.runIdPath + browserName + suiteId;
    return fs.existsSync(path)
      ? fs.readFileSync(path)
      : null;
  }

  writeRunId(id, browserName, suiteId) {
    fs.writeFileSync(this.runIdPath + browserName + suiteId, id);
  }

  /**
   * @param {string} suiteId
   * @return {string}
   */
  _getSuiteName(suiteId) {
    const allSuites = this.getSuites();
    const suite = allSuites.find(suite => suite.id == suiteId);
    return suite.name || 'unknown suite;'
  }

}

module.exports = TestRail;

/**
 * Jest environment that runs one test file in America/New_York (C-5).
 * A test file's own process.env is a copy, so setting TZ there does not move the clock;
 * this sets it on the worker process for the file and restores it afterwards.
 * Use with a docblock: @jest-environment ./test/baseline/tz-new-york-environment.js
 */
const NodeEnvironment = require('jest-environment-node').TestEnvironment;

class NewYorkEnvironment extends NodeEnvironment {
  async setup() {
    this.previousTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    await super.setup();
  }

  async teardown() {
    if (this.previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = this.previousTz;
    await super.teardown();
  }
}

module.exports = NewYorkEnvironment;

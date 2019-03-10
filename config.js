module.exports = {
  delay: 50, // delay in ms between sending requests
  domain: 'sixflags.com',
  timeout: 50000,
  thresholds: { // times in ms
    good: 1000, // less than this is good
    bad: 5000 // greater than this is bad
  }
};

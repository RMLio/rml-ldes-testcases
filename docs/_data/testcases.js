/**
 * author: Pieter Heyvaert (pheyvaer.heyvaert@ugent.be)
 * Ghent University - imec - IDLab
 */

const QueryEngine = require('@comunica/query-sparql-rdfjs').QueryEngine;
const N3 = require('n3');
const Q = require('q');
const fs = require('fs');
const https = require('https');

module.exports = async () => {
  const result = await getTestCases('../metadata.nt');

  return result;
};

async function getTestCases(path) {
  const rdfjsSource = await getRDFjsSourceFromFile(path);
  const myEngine = new QueryEngine();
  const testcases = [];

  const bindingsStream = await myEngine.queryBindings(`SELECT * {
     ?s a <http://www.w3.org/ns/earl#TestCase>;
        <http://schema.org/name> ?name;
        <http://schema.org/description> ?description;
        <http://rml.io/ns/test-case/rules> [
          <http://www.w3.org/ns/dcat#distribution> [
            <http://www.w3.org/ns/dcat#downloadUrl> ?rules
          ]
        ];
        <http://purl.org/dc/terms/identifier> ?id;
        <http://www.w3.org/2006/03/test-description#specificationReference> ?specRef;
    .
  }`,
    { sources: [{ type: 'rdfjsSource', value: rdfjsSource }] });
  const bindings = await bindingsStream.toArray();
  let processed = [];
  for (let index = 0; index < bindings.length; index++) {
    const data = bindings[index];
    const id = data.get('id').value;

    if (id.indexOf('SPARQL') === -1) {
      console.log(`${id}: started.`);

      let outputBase = null;
      let outputBaseStr = null;
      outputBase = "../test-cases/" + id + "/output-base.nq";
      outputBaseStr = await fs.promises.readFile(outputBase, 'utf-8')
      outputBaseStr = outputBaseStr.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      console.log(`${id}: output base is read from file`);

      let outputChange = null;
      let outputChangeStr = null;
      outputChange = "../test-cases/" + id + "/output-change.nq";
      outputChangeStr = await fs.promises.readFile(outputChange, 'utf-8')
      outputChangeStr = outputChangeStr.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      console.log(`${id}: output change is read from file`);

      const rulesBase = "../test-cases/" + id + "/base.rml.ttl"
      let rulesBaseStr = await fs.promises.readFile(rulesBase, 'utf-8');
      rulesBaseStr = rulesBaseStr.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      console.log(`${id}: base rules are read from file`);

      const rulesChange = "../test-cases/" + id + "/change.rml.ttl"
      let rulesChangeStr = await fs.promises.readFile(rulesChange, 'utf-8');
      rulesChangeStr = rulesChangeStr.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      console.log(`${id}: change rules are read from file`);

      let specRef = null;
      if (data.has('specRef')) {
        specRef = data.get('specRef').value || null;
      }

      if (processed.indexOf(data.get('s').value) == -1) {
        testcases.push({
          iri: data.get('s').value,
          title: data.get('name').value,
          description: data.get('description').value,
          rulesBase,
          rulesBaseStr,
          rulesChange,
          rulesChangeStr,
          id,
          errorExpected: false,
          outputBase,
          outputBaseStr,
          outputChange,
          outputChangeStr,
          specRef
        });
        processed.push(data.get('s').value);
      }

      console.log(`${id}: done.`);
    } else {
      console.log(`${id}: skipped.`);
    }
  }

  testcases.sort((a, b) => {
    if (a.id > b.id) {
      return 1;
    } else {
      return -1;
    }
  });

  return testcases;
}

/**
 * This method returns an RDFJSSource of an file
 * @param {string} path: path of the file
 * @returns {Promise}: a promise that resolve with the corresponding RDFJSSource
 */
function getRDFjsSourceFromFile(path) {
  const deferred = Q.defer();

  fs.readFile(path, 'utf-8', (err, data) => {
    if (err) deferred.reject(err);

    const parser = new N3.Parser();
    const store = new N3.Store();

    parser.parse(data, (err, quad, prefixes) => {
      if (err) {
        console.error(err);
        deferred.reject(err);
      } else if (quad) {
        store.addQuad(quad);
      } else {
        const source = {
          match: function (s, p, o, g) {
            return require('streamify-array')(store.getQuads(s, p, o, g));
          }
        };

        deferred.resolve(source);
      }
    });
  });

  return deferred.promise;
}

function _getHTTP(url) {
  const deferred = Q.defer();

  https.get(url, (res) => {
    const { statusCode } = res;

    let error;
    if (statusCode !== 200) {
      console.log(url);
      error = new Error('Request Failed.\n' +
        `Status Code: ${statusCode}`);
    }

    if (error) {
      console.error(error.message);
      // consume response data to free up memory
      res.resume();
      return;
    }

    res.setEncoding('utf8');
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      try {
        deferred.resolve(rawData);
      } catch (e) {
        console.error(e.message);
      }
    });
  }).on('error', (e) => {
    console.error(`Got error: ${e.message}`);
  });

  return deferred.promise;
}

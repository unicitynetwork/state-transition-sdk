import path from 'path';

import { DockerComposeEnvironment, StartedDockerComposeEnvironment, Wait } from 'testcontainers';

import { AggregatorClient } from '../../../src/api/AggregatorClient.js';
import { StateTransitionClient } from '../../../src/StateTransitionClient.js';
import { testTransferFlow, testSplitFlow } from '../../token/CommonTestFlow.js';

const aggregatorPort = 3000; // the port defined in docker-compose.yml
const containerName = 'aggregator-test'; // the container name defined in docker-compose.yml
const composeFileDir = path.resolve(__dirname, '../docker/aggregator/');

describe('Transition', function () {
  let dockerEnvironment: StartedDockerComposeEnvironment;
  let client: StateTransitionClient;

  beforeAll(async () => {
    // currently cannot use DockerComposeEnvironment to run multiple tests in parallel
    // as the only way to go from dockerEnvironment to container is by using dockerEnvironment.getContainer(containerName)
    // however, it requires the container name to specified in docker compose file, and docker does not allow to run
    // multiple containers with the same name
    console.log('running docker compose file: ' + path.join(composeFileDir, 'docker-compose.yml'));
    dockerEnvironment = await new DockerComposeEnvironment(composeFileDir, 'docker-compose.yml')
      .withWaitStrategy(containerName, Wait.forLogMessage('listening on port ' + aggregatorPort))
      .up();
    const container = dockerEnvironment.getContainer(containerName);

    const host = container.getHost();
    const port = container.getMappedPort(aggregatorPort);
    const aggregatorUrl = `http://${host}:${port}`;
    client = new StateTransitionClient(new AggregatorClient(aggregatorUrl));
  }, 180000);

  afterAll(async () => {
    if (dockerEnvironment) {
      await dockerEnvironment.down();
    }
  }, 30000);

  it('should verify the token latest state', async () => {
    await testTransferFlow(client);
  }, 30000);

  it('should split tokens', async () => {
    await testSplitFlow(client);
  }, 30000);
});

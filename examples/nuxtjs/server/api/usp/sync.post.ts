import { defineEventHandler } from 'h3';
import { usp } from '../../utils/usp';

export default defineEventHandler(async (event) => {
  await usp.handleSync(event.node.req, event.node.res);
});

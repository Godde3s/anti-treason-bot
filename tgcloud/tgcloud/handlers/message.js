import { dispatch } from '../lib/adapter.js';

export default async function (message, ctx) {
  await dispatch(ctx.update || { message });
}

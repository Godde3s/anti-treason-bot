import { dispatch } from '../lib/adapter.js';

export default async function (callbackQuery, ctx) {
  await dispatch(ctx.update || { callback_query: callbackQuery });
}

import { dispatch } from '../lib/adapter.js';

export default async function (channelPost, ctx) {
  await dispatch(ctx.update || { channel_post: channelPost });
}

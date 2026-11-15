import { dispatch } from '../lib/adapter.js';

export default async function (editedChannelPost, ctx) {
  await dispatch(ctx.update || { edited_channel_post: editedChannelPost });
}

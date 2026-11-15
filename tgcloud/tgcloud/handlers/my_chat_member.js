import { dispatch } from '../lib/adapter.js';

export default async function (myChatMember, ctx) {
  await dispatch(ctx.update || { my_chat_member: myChatMember });
}

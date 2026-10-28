'use strict';
const fs=require('node:fs');
const {createInterface}=require('node:readline/promises');
const {stdin,stdout}=require('node:process');
const {CONFIG}=require('../server/config');
const {openDatabase}=require('../server/database');
const {normalizeLoginUsername}=require('../server/auth');
const {recoveryOrigin}=require('../server/mailer');
const {issueSupportRecovery,revokeSupportRecovery}=require('../server/support-recovery');

// This console is host-only. It never accepts passwords or publishes a reset secret.
const CONSOLE_CONFIG=Object.freeze({confirmationPrefix:'VERIFIED @',revokePrefix:'REVOKE @',maximumSearchLength:128});
const HELP=`Nexus host-assisted account recovery
Usage: npm run recover:account
       npm run recover:account -- --find @username
       npm run recover:account -- --revoke ACCOUNT_ID

Issue a link only after independently establishing the account owner's identity.
A username, display name, shared server or badge does not prove ownership.
No reset link can be issued through a website API or by a server moderator.
The link expires, works once, and is written to a private host file, not stdout.
`;
async function main(args=process.argv.slice(2)){
 if(args.includes('--help')||args.includes('-h')){console.info(HELP);return;}
 if(args.length&&!(args.length===2&&['--find','--revoke'].includes(args[0])))throw new Error('Unknown arguments. Use --help.');
 if(!fs.existsSync(CONFIG.databasePath))throw new Error('The configured Nexus database does not exist. Use this tool inside your real installation; do not create an empty replacement database.');
 const db=openDatabase(CONFIG.databasePath);let prompt;
 try{
  if(args[0]==='--find'){
   const username=normalizeLoginUsername(args[1]);
   const user=username&&db.prepare('SELECT id,username,createdAt FROM users WHERE username=?').get(username);
   if(!user)throw new Error('No account matches that permanent username.');
   console.info(JSON.stringify(user,null,2));return;
  }
  if(!stdin.isTTY||!stdout.isTTY)throw new Error('Issuing or revoking a link requires an interactive host terminal. Use --find to locate an account ID.');
  console.info(HELP);console.info(`[Nexus recovery] Database: ${CONFIG.databasePath}`);prompt=createInterface({input:stdin,output:stdout});
  const identifier=args[0]==='--revoke'?args[1]:(await prompt.question('Permanent username or immutable account ID: ')).trim();
  const username=normalizeLoginUsername(identifier);
  const user=db.prepare('SELECT id,username,createdAt FROM users WHERE id=? OR username=?').get(identifier,username||'');
  if(!user)throw new Error('No account matches that identifier.');
  console.info(`Account: @${user.username}\nImmutable ID: ${user.id}\nCreated: ${user.createdAt}`);
  if(args[0]==='--revoke'){
   const confirmed=await prompt.question(`Type ${CONSOLE_CONFIG.revokePrefix}${user.username} to invalidate host-issued links: `);
   if(confirmed!==CONSOLE_CONFIG.revokePrefix+user.username)throw new Error('No confirmation received. Nothing was changed.');
   const count=revokeSupportRecovery(db,user.id);console.info(`Revoked ${count} host-issued recovery link(s). Password and sessions were not changed.`);return;
  }
  console.info('Verify ownership through an independently established private contact or identity process. Do not issue a link just because someone knows this username.');
  const confirmation=await prompt.question(`After completing that verification, type ${CONSOLE_CONFIG.confirmationPrefix}${user.username}: `);
  if(confirmation!==CONSOLE_CONFIG.confirmationPrefix+user.username)throw new Error('Ownership verification was not confirmed. Nothing was changed.');
  const origin=recoveryOrigin(CONFIG.publicOrigin)||(await prompt.question('Trusted HTTPS origin of this Nexus website: ')).trim();
  const result=issueSupportRecovery(db,CONFIG,{userId:user.id,confirmUsername:user.username,identityVerified:true,origin});
  console.info(`Private recovery file: ${result.file}\nExpires: ${new Date(result.expiresAt).toISOString()}\nOpen this file locally and deliver its link privately to the verified owner. Delete the file after the handoff.\nThe account is unchanged until the owner submits a new password through the link.`);
 }finally{prompt?.close();db.close();}
}
if(require.main===module)main().catch(error=>{console.error('[Nexus account recovery]',error.message);process.exitCode=1;});
module.exports={CONSOLE_CONFIG,main};

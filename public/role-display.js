// Each online member appears once, under their first enabled role in server order.
export const OWNER_DISPLAY_ID = '__owner__';
export function orderedRoles(server) {
  return [{id:OWNER_DISPLAY_ID,name:'Server owner',icon:'crown',color:'#e6bf70',position:server.ownerRolePosition||0,displayMembers:Boolean(server.ownerRoleDisplay),ownerRole:true},...(server.roles||[])].sort((a,b)=>(a.position||0)-(b.position||0)||a.id.localeCompare(b.id));
}
export function memberGroups(server,users) {
  const roles=orderedRoles(server).filter(role=>role.displayMembers),groups=roles.map(role=>({key:role.id,label:role.name,role,members:[]})),online={key:'online',label:'Online',members:[]},offline={key:'offline',label:'Offline',members:[]};
  const byId=new Map(users.map(user=>[user.id,user]));
  for(const member of server.members){const user={...(byId.get(member.userId)||{id:member.userId,displayName:'Nexus user',status:'offline'}),role:member.role,roleIds:member.roleIds||[],assignedRoles:(server.roles||[]).filter(role=>member.roleIds?.includes(role.id))};
    if(['offline','invisible'].includes(user.status)){offline.members.push(user);continue;}
    const group=groups.find(group=>group.role.ownerRole?member.role==='owner':member.roleIds?.includes(group.key));(group||online).members.push(user);
  }
  for(const group of [...groups,online,offline])group.members.sort((a,b)=>a.displayName.localeCompare(b.displayName,undefined,{sensitivity:'base'})||a.id.localeCompare(b.id));
  return [...groups,online,offline].filter(group=>group.members.length);
}

import {db} from './db.js';
const pad=n=>String(n).padStart(2,'0');
export function validateRoster(month){
 const roster=db.prepare('SELECT id FROM rosters WHERE month=?').get(month); if(!roster)return {issues:[],summary:{days:0,required:0,covered:0,coverage:0}};
 const [y,m]=month.split('-').map(Number),days=new Date(y,m,0).getDate();
 const rules=db.prepare(`SELECT r.*,b.name brand,p.name process FROM rules r JOIN brands b ON b.id=r.brand_id JOIN processes p ON p.id=r.process_id WHERE b.active=1`).all();
 const issues=[];let required=0,covered=0;
 for(let d=1;d<=days;d++){
  const date=`${month}-${pad(d)}`,dow=new Date(`${date}T00:00:00`).getDay(),holiday=db.prepare('SELECT name FROM holidays WHERE date=?').get(date);
  for(const r of rules){const operates=r.operating==='365'||(r.operating==='daily'||r.operating==='daily_no_holidays')||(r.operating==='weekdays'&&dow!==0&&dow!==6&&!holiday)||(r.operating==='sunday_holidays_off'&&dow!==0&&!holiday);
   if(!operates||(r.operating==='daily_no_holidays'&&holiday))continue;
   const dayOverrides=JSON.parse(r.day_overrides||'{}'),minStaff=Number(dayOverrides[dow]??r.min_staff);
   required+=minStaff;
   const count=db.prepare(`SELECT count(DISTINCT sa.assignment_id) n FROM shift_assignments sa JOIN shifts s ON s.id=sa.shift_id JOIN assignments a ON a.id=sa.assignment_id JOIN employees e ON e.id=s.employee_id WHERE s.roster_id=? AND s.date=? AND s.status='working' AND a.brand_id=? AND a.process_id=? AND e.active=1`).get(roster.id,date,r.brand_id,r.process_id).n;
   covered+=Math.min(count,minStaff);
   if(count<minStaff)issues.push({date,brand:r.brand,process:r.process,required:minStaff,actual:count,severity:'critical',message:`${r.brand} · ${r.process}: ${minStaff-count} more ${minStaff-count===1?'person':'people'} needed`});
  }
  const doubles=db.prepare(`SELECT employee_id,count(*) n FROM shifts WHERE roster_id=? AND date=? AND status='working' GROUP BY employee_id HAVING n>1`).all(roster.id,date);
  doubles.forEach(x=>issues.push({date,severity:'critical',message:`Employee #${x.employee_id} has overlapping shifts`}));
 }
 return {issues,summary:{days,required,covered,coverage:required?Math.round(covered/required*100):100}};
}
export function generateRoster(month){
 if(!/^\d{4}-\d{2}$/.test(month))throw new Error('Month must use YYYY-MM format');
 const [year,mon]=month.split('-').map(Number);if(mon<1||mon>12)throw new Error('Invalid month');
 const days=new Date(year,mon,0).getDate();
 const transaction=db.transaction(()=>{
  const old=db.prepare('SELECT id FROM rosters WHERE month=?').get(month);if(old)db.prepare('DELETE FROM rosters WHERE id=?').run(old.id);
  const rosterId=db.prepare("INSERT INTO rosters(month,status,generated_at) VALUES(?,'draft',?)").run(month,new Date().toISOString()).lastInsertRowid;
  const employees=db.prepare('SELECT * FROM employees WHERE active=1 ORDER BY id').all();
  const assignments=db.prepare(`SELECT a.*,b.name brand,p.name process,r.operating,r.min_staff,r.shift_start,r.shift_end FROM assignments a JOIN brands b ON b.id=a.brand_id JOIN processes p ON p.id=a.process_id JOIN rules r ON r.brand_id=a.brand_id AND r.process_id=a.process_id WHERE b.active=1`).all();
  const unavailable=db.prepare("SELECT * FROM unavailability WHERE status='approved' AND date BETWEEN ? AND ?").all(`${month}-01`,`${month}-${pad(days)}`);
  const unavailableMap=new Map(unavailable.map(x=>[`${x.employee_id}|${x.date}`,x]));
  const insShift=db.prepare('INSERT INTO shifts(roster_id,employee_id,date,status,reason) VALUES(?,?,?,?,?)');
  const insLink=db.prepare('INSERT INTO shift_assignments(shift_id,assignment_id) VALUES(?,?)');
  for(let d=1;d<=days;d++){
   const date=`${month}-${pad(d)}`,dow=new Date(`${date}T00:00:00`).getDay(),holiday=db.prepare('SELECT name FROM holidays WHERE date=?').get(date);
   const chosen=new Map();
   for(const a of assignments){
    const works=a.operating==='365'||a.operating==='daily'||a.operating==='daily_no_holidays'||(a.operating==='weekdays'&&dow!==0&&dow!==6&&!holiday)||(a.operating==='sunday_holidays_off'&&dow!==0&&!holiday);
    if(!works||(a.operating==='daily_no_holidays'&&holiday))continue;
    const emp=employees.find(e=>e.id===a.employee_id);if(!emp)continue;
    const off=unavailableMap.get(`${emp.id}|${date}`);
    if(off)continue;
    if(dow===emp.weekly_off)continue;
    if(!chosen.has(emp.id))chosen.set(emp.id,[]);chosen.get(emp.id).push(a.id);
   }
   // One employee gets one shift/day, even if assigned to multiple processes/brands.
   for(const emp of employees){
    const abs=unavailableMap.get(`${emp.id}|${date}`),isOff=new Date(`${date}T00:00:00`).getDay()===emp.weekly_off;
    const links=chosen.get(emp.id)||[];
    const status=abs?(abs.type==='leave'?'leave':abs.type==='comp_off'?'comp_off':'unavailable'):(isOff?'weekly_off':holiday?'holiday':links.length?'working':'off');
    const reason=abs?.note|| (abs?abs.type:isOff?'Weekly off':holiday?'Public holiday':'');
    const shiftId=insShift.run(rosterId,emp.id,date,status,reason).lastInsertRowid;
    if(status==='working')links.forEach(id=>insLink.run(shiftId,id));
   }
  }
 });transaction();
 return {roster:db.prepare('SELECT * FROM rosters WHERE month=?').get(month),...validateRoster(month)};
}
export function updateShift(month,employeeId,date,status){
 const roster=db.prepare('SELECT id FROM rosters WHERE month=?').get(month);if(!roster)throw new Error('Generate this month first');
 if(status==='working'){const emp=db.prepare('SELECT weekly_off,active FROM employees WHERE id=?').get(employeeId);if(!emp||!emp.active)throw new Error('Employee is not active');const dow=new Date(`${date}T00:00:00`).getDay();if(dow===emp.weekly_off)throw new Error('Cannot schedule an employee on their configured weekly off');const blocked=db.prepare("SELECT type FROM unavailability WHERE employee_id=? AND date=? AND status='approved'").get(employeeId,date);if(blocked)throw new Error(`Cannot schedule employee: approved ${blocked.type} exists for this date`);}
 const valid=['working','weekly_off','leave','comp_off','unavailable','off'];if(!valid.includes(status))throw new Error('Invalid shift status');
 const transaction=db.transaction(()=>{
  const row=db.prepare('SELECT id FROM shifts WHERE roster_id=? AND employee_id=? AND date=?').get(roster.id,employeeId,date);if(!row)throw new Error('Shift not found');
  db.prepare('DELETE FROM shift_assignments WHERE shift_id=?').run(row.id);
  db.prepare('UPDATE shifts SET status=?,reason=? WHERE id=?').run(status,status==='working'?'Manual assignment':'Manual edit',row.id);
  if(status==='working'){
   const as=db.prepare('SELECT id FROM assignments WHERE employee_id=?').all(employeeId);const ins=db.prepare('INSERT INTO shift_assignments(shift_id,assignment_id) VALUES(?,?)');as.forEach(a=>ins.run(row.id,a.id));
  }
 });transaction();return validateRoster(month);
}

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve(process.env.DB_DIR||'data'); fs.mkdirSync(dir,{recursive:true});
export const db=new Database(path.join(dir,'roster.sqlite'));
db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS pods(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,lead TEXT NOT NULL,color TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS employees(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,pod_id INTEGER REFERENCES pods(id),role TEXT DEFAULT 'Associate',weekly_off INTEGER DEFAULT 0,active INTEGER DEFAULT 1,preference TEXT DEFAULT 'balanced');
CREATE TABLE IF NOT EXISTS brands(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,segment TEXT NOT NULL,color TEXT NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS processes(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,description TEXT);
CREATE TABLE IF NOT EXISTS assignments(id INTEGER PRIMARY KEY,employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,brand_id INTEGER REFERENCES brands(id) ON DELETE CASCADE,process_id INTEGER REFERENCES processes(id) ON DELETE CASCADE,UNIQUE(employee_id,brand_id,process_id));
CREATE TABLE IF NOT EXISTS rules(id INTEGER PRIMARY KEY,brand_id INTEGER REFERENCES brands(id) ON DELETE CASCADE,process_id INTEGER REFERENCES processes(id) ON DELETE CASCADE,operating TEXT NOT NULL DEFAULT 'daily',min_staff INTEGER NOT NULL DEFAULT 1,day_overrides TEXT NOT NULL DEFAULT '{}',shift_start TEXT DEFAULT '09:00',shift_end TEXT DEFAULT '18:00',UNIQUE(brand_id,process_id));
CREATE TABLE IF NOT EXISTS holidays(id INTEGER PRIMARY KEY,date TEXT UNIQUE NOT NULL,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS unavailability(id INTEGER PRIMARY KEY,employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,date TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('leave','comp_off','unavailable')),status TEXT NOT NULL DEFAULT 'approved',note TEXT DEFAULT '',UNIQUE(employee_id,date));
CREATE TABLE IF NOT EXISTS rosters(id INTEGER PRIMARY KEY,month TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'draft',generated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shifts(id INTEGER PRIMARY KEY,roster_id INTEGER REFERENCES rosters(id) ON DELETE CASCADE,employee_id INTEGER REFERENCES employees(id),date TEXT NOT NULL,status TEXT NOT NULL,reason TEXT DEFAULT '',UNIQUE(roster_id,employee_id,date));
CREATE TABLE IF NOT EXISTS shift_assignments(id INTEGER PRIMARY KEY,shift_id INTEGER REFERENCES shifts(id) ON DELETE CASCADE,assignment_id INTEGER REFERENCES assignments(id),UNIQUE(shift_id,assignment_id));
`);
const ruleColumns=db.prepare('PRAGMA table_info(rules)').all();
if(!ruleColumns.some(c=>c.name==='day_overrides'))db.exec("ALTER TABLE rules ADD COLUMN day_overrides TEXT NOT NULL DEFAULT '{}'");
function seed(){
 if(db.prepare('SELECT count(*) n FROM employees').get().n) return;
 const podData=[['North Pod','Aarav Mehta','#6D8AFF'],['South Pod','Diya Shah','#29B6A6'],['Growth Pod','Kabir Rao','#E5A34B'],['CX Pod','Mira Iyer','#B28BEE'],['Special Ops','Ishaan Das','#E47F91']];
 const insPod=db.prepare('INSERT INTO pods(name,lead,color) VALUES(?,?,?)'); podData.forEach(x=>insPod.run(...x));
 const names=['Aarav Mehta','Diya Shah','Kabir Rao','Mira Iyer','Ishaan Das','Ananya Nair','Rohan Kulkarni','Priya Menon','Vivaan Joshi','Sara Khan','Aditya Patil','Ira Kapoor','Arjun Desai','Meera Reddy','Reyansh Shah','Kiara Bose','Dev Malhotra','Tara Gupta','Neil Fernandes','Myra Sethi','Ayaan Verma','Saanvi Rao','Krish Nambiar','Aditi Jain','Yash Bhat','Navya Pillai','Omkar Pawar','Riya Sen','Dhruv Arora','Anika Thomas','Parth Shah','Zoya Ali'];
 const insEmp=db.prepare('INSERT INTO employees(name,email,pod_id,role,weekly_off,preference) VALUES(?,?,?,?,?,?)');
 names.forEach((n,i)=>insEmp.run(n,n.toLowerCase().replaceAll(' ','.')+'@datastraw.demo',(i%5)+1,i%8===0?'Pod Coordinator':'Associate',i<20?0:(i+1)%7,i%4===0?'weekends': 'balanced'));
 const brands=[
 ['Aurelia Living','Home & Lifestyle','#6D8AFF'],['Mitti & Co','Home & Lifestyle','#29B6A6'],['Nourish Labs','Food & Wellness','#E5A34B'],['Veda Naturals','Beauty','#B28BEE'],['Urban Tread','Fashion','#E47F91'],['Little Sprout','Baby & Kids','#6FA7C8'],['Solstice Skin','Beauty','#D58FA8'],['Nomad Gear','Travel','#8C9AAE'],['Daily Ritual','Food & Wellness','#C39A69'],['Casa Verde','Home & Lifestyle','#79A98B'],
 ['Bloom Theory','Beauty','#B98BCB'],['Terra Goods','Home & Lifestyle','#7DAF9A'],['Peak Motion','Sports & Fitness','#7796C8'],['Kindred Kids','Baby & Kids','#D99C75'],['Morrow Coffee','Food & Beverage','#A87D61'],['Thread & Form','Fashion','#B68AA4'],['Coastal Supply','Lifestyle','#6CAEB2'],['Pure Pantry','Food & Wellness','#C8A55C'],['Luma Home','Home & Lifestyle','#8A9DD4'],['Evertrail','Travel','#87A77C'],
 ['Fable & Fern','Beauty','#A78AC8'],['Monsoon Market','Retail','#D69B62'],['Orbit Active','Sports & Fitness','#6E9BB8'],['Sunday Studio','Lifestyle','#D38E9B']
 ];
 const insBrand=db.prepare('INSERT INTO brands(name,segment,color) VALUES(?,?,?)'); brands.forEach(x=>insBrand.run(...x));
 const procs=[['Customer Support','Customer queries, tickets and escalations'],['Abandoned Cart','Cart recovery and conversion outreach'],['Retention','Repeat purchase and win-back campaigns'],['NDR','Non-delivery report resolution'],['Order Operations','Order tracking and operational exceptions']];
 const insProc=db.prepare('INSERT INTO processes(name,description) VALUES(?,?)');procs.forEach(x=>insProc.run(...x));
 const insA=db.prepare('INSERT INTO assignments(employee_id,brand_id,process_id) VALUES(?,?,?)');
 const insR=db.prepare('INSERT INTO rules(brand_id,process_id,operating,min_staff,shift_start,shift_end) VALUES(?,?,?,?,?,?)');
 // 20 of 24 brands (83%) have one dedicated owner; four brands have three-person teams.
 const singleProcesses=[[1,2],[1,3],[1,2,3],[1,4],[1,5],[1,2],[1,3],[1,4],[1,2,3],[1,4,5]];
 for(let bi=0;bi<20;bi++){
  const owner=bi+1,plist=singleProcesses[bi%singleProcesses.length];
  plist.forEach(p=>{insA.run(owner,bi+1,p);const operating=p===1?'weekdays':'weekdays';insR.run(bi+1,p,operating,1,'09:00','18:00')});
 }
 for(let group=0;group<4;group++){
  const bi=20+group,people=[21+group*3,22+group*3,23+group*3];
  const operating=group===0?'365':group===1?'daily':'daily_no_holidays';
  people.forEach(e=>insA.run(e,bi+1,1));
  insA.run(people[1],bi+1,2);insA.run(people[2],bi+1,3);
  insR.run(bi+1,1,operating,2,'09:00','18:00');
  insR.run(bi+1,2,'weekdays',1,'09:00','18:00');
  insR.run(bi+1,3,'sunday_holidays_off',1,'09:00','18:00');
 }
 const holidays=[['2026-11-08','Diwali (observed)'],['2026-11-26','Regional holiday'],['2026-12-25','Christmas']];
 const ih=db.prepare('INSERT OR IGNORE INTO holidays(date,name) VALUES(?,?)');holidays.forEach(x=>ih.run(...x));
}
seed();

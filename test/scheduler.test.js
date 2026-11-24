import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const testDir=mkdtempSync(path.join(tmpdir(),'rosteros-test-'));
process.env.DB_DIR=testDir;
const {db}=await import('../server/db.js');
const {generateRoster,validateRoster,updateShift}=await import('../server/scheduler.js');

test('seed models 32 employees and an approximately 80/20 brand mix',()=>{
 assert.equal(db.prepare('SELECT count(*) n FROM employees').get().n,32);
 assert.equal(db.prepare('SELECT count(*) n FROM brands').get().n,24);
 const counts=db.prepare('SELECT brand_id,count(DISTINCT employee_id) n FROM assignments GROUP BY brand_id').all();
 assert.equal(counts.filter(x=>x.n===1).length,20);
 assert.equal(counts.filter(x=>x.n>1).length,4);
});

test('monthly generation creates one shift per employee per date and validates coverage',()=>{
 const result=generateRoster('2026-11');
 assert.equal(result.roster.month,'2026-11');
 assert.ok(result.summary.days===30);
 assert.equal(db.prepare('SELECT count(*) n FROM shifts WHERE roster_id=?').get(result.roster.id).n,32*30);
 assert.equal(db.prepare('SELECT count(*) n FROM (SELECT employee_id,date,count(*) c FROM shifts WHERE roster_id=? GROUP BY employee_id,date HAVING c>1)').get(result.roster.id).n,0);
 assert.ok(result.summary.required>0);
});

test('approved unavailability after generation creates a visible coverage gap',()=>{
 db.prepare("INSERT INTO unavailability(employee_id,date,type,status,note) VALUES(1,'2026-11-02','leave','approved','Test leave')").run();
 updateShift('2026-11',1,'2026-11-02','leave');
 const result=validateRoster('2026-11');
 assert.ok(result.issues.some(x=>x.date==='2026-11-02'&&x.brand==='Aurelia Living'));
});

test('manual edits cannot schedule an employee on an approved weekly off',()=>{
 assert.throws(()=>updateShift('2026-11',1,'2026-11-01','working'),/weekly off/i);
});

test.after(()=>{db.close();rmSync(testDir,{recursive:true,force:true});});

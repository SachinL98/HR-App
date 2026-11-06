import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';

process.env.FILE_STORAGE_DIR = mkdtempSync(join(tmpdir(), 'hr-files-'));

import { AppModule } from '../src/app.module';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);

describe('People: checklists and kept documents', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(() => app.close());
  const api = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const setup = async () => {
    const u = uniq();
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: `People ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Olivia',
        lastName: 'Owner',
        email: `o-${u}@ppl.test`,
        password: pw,
      })
      .expect(201);
    const owner = r.body.accessToken as string;
    const add = async (first: string, managerId?: string) => {
      const inv = await api()
        .post('/invites')
        .set(auth(owner))
        .send({ email: `${first.toLowerCase()}-${uniq()}@ppl.test`, managerId })
        .expect(201);
      const token = new URL(inv.body.devLink as string).searchParams.get(
        'token',
      );
      const acc = await api()
        .post('/auth/invites/accept')
        .send({ token, firstName: first, lastName: 'Person', password: pw })
        .expect(201);
      const t = acc.body.accessToken as string;
      const me = await api().get('/me').set(auth(t)).expect(200);
      return { token: t, id: me.body.id as string };
    };
    const boss = await add('Boss');
    const newbie = await add('Newbie', boss.id);
    const other = await add('Other');
    return { owner, boss, newbie, other };
  };

  it('starts a checklist, splits the tasks between the right people, and lets only them tick', async () => {
    const { owner, boss, newbie, other } = await setup();
    await api()
      .post('/checklist-templates')
      .set(auth(newbie.token))
      .send({})
      .expect(403);
    const t = await api()
      .post('/checklist-templates')
      .set(auth(owner))
      .send({
        name: 'New starter',
        kind: 'onboarding',
        items: [
          { title: 'Sign your contract', who: 'employee', dueDays: 3 },
          { title: 'Book a welcome chat', who: 'manager' },
          { title: 'Order a laptop', who: 'hr', dueDays: 1 },
        ],
      })
      .expect(201);
    await api()
      .post(`/members/${newbie.id}/checklists`)
      .set(auth(newbie.token))
      .send({ templateId: t.body.id })
      .expect(403);
    await api()
      .post(`/members/${newbie.id}/checklists`)
      .set(auth(owner))
      .send({ templateId: t.body.id })
      .expect(201);

    // The new person and their manager each see their own task; strangers see nothing.
    const mine = await api()
      .get('/checklists/mine')
      .set(auth(newbie.token))
      .expect(200);
    expect(mine.body.map((x: { title: string }) => x.title)).toEqual([
      'Sign your contract',
    ]);
    const bossTasks = await api()
      .get('/checklists/mine')
      .set(auth(boss.token))
      .expect(200);
    expect(bossTasks.body.map((x: { title: string }) => x.title)).toEqual([
      'Book a welcome chat',
    ]);
    const hrTasks = await api()
      .get('/checklists/mine')
      .set(auth(owner))
      .expect(200);
    expect(hrTasks.body.map((x: { title: string }) => x.title)).toContain(
      'Order a laptop',
    );
    expect(
      (await api().get('/checklists/mine').set(auth(other.token))).body,
    ).toEqual([]);
    await api()
      .get(`/members/${newbie.id}/checklists`)
      .set(auth(other.token))
      .expect(403);
    await api()
      .get(`/members/${newbie.id}/checklists`)
      .set(auth(boss.token))
      .expect(200);

    // Notified about their tasks.
    const note = await api()
      .get('/notifications')
      .set(auth(newbie.token))
      .expect(200);
    expect(JSON.stringify(note.body)).toContain('New starter');

    // Only the owner of a task (or a checklist manager) can tick it.
    const taskId = mine.body[0].id as string;
    await api()
      .post(`/checklist-tasks/${taskId}/done`)
      .set(auth(other.token))
      .send({ done: true })
      .expect(403);
    await api()
      .post(`/checklist-tasks/${taskId}/done`)
      .set(auth(newbie.token))
      .send({ done: true })
      .expect(201);
    expect(
      (await api().get('/checklists/mine').set(auth(newbie.token))).body,
    ).toEqual([]);
    const full = await api()
      .get(`/members/${newbie.id}/checklists`)
      .set(auth(newbie.token))
      .expect(200);
    expect(full.body[0].tasks[0].doneAt).toBeTruthy();
  });

  it('keeps documents on a profile, visible to the person only when allowed', async () => {
    const { owner, newbie, other } = await setup();
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText('Contract');
    const b64 = Buffer.from(await pdf.save()).toString('base64');
    const body = (title: string, visibleToMember: boolean) => ({
      title,
      kind: 'contract',
      fileName: `${title}.pdf`,
      fileBase64: b64,
      visibleToMember,
    });
    await api()
      .post(`/members/${newbie.id}/documents`)
      .set(auth(newbie.token))
      .send(body('x', true))
      .expect(403);
    await api()
      .post(`/members/${newbie.id}/documents`)
      .set(auth(owner))
      .send({
        ...body('bad', true),
        fileBase64: Buffer.from('just text').toString('base64'),
      })
      .expect(400);
    const shown = await api()
      .post(`/members/${newbie.id}/documents`)
      .set(auth(owner))
      .send(body('Contract', true))
      .expect(201);
    await api()
      .post(`/members/${newbie.id}/documents`)
      .set(auth(owner))
      .send(body('Warning letter', false))
      .expect(201);

    const own = await api()
      .get(`/members/${newbie.id}/documents`)
      .set(auth(newbie.token))
      .expect(200);
    expect(own.body.map((d: { title: string }) => d.title)).toEqual([
      'Contract',
    ]);
    const all = await api()
      .get(`/members/${newbie.id}/documents`)
      .set(auth(owner))
      .expect(200);
    expect(all.body).toHaveLength(2);
    await api()
      .get(`/members/${newbie.id}/documents`)
      .set(auth(other.token))
      .expect(403);

    const f = await api()
      .get(`/member-documents/${shown.body.id}/file`)
      .set(auth(newbie.token))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((f.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await api()
      .get(`/member-documents/${shown.body.id}/file`)
      .set(auth(other.token))
      .expect(404);
    const hidden = all.body.find(
      (d: { title: string }) => d.title === 'Warning letter',
    ) as { id: string };
    await api()
      .get(`/member-documents/${hidden.id}/file`)
      .set(auth(newbie.token))
      .expect(404);
    await api()
      .delete(`/member-documents/${shown.body.id}`)
      .set(auth(newbie.token))
      .expect(403);
    await api()
      .delete(`/member-documents/${shown.body.id}`)
      .set(auth(owner))
      .expect(200);
  });
});

import {
  listQueuedInputs,
  submitQueuedInput,
  updateQueuedInputDelivery,
  withdrawQueuedInput,
} from '../queue';

const mockRequest = jest.fn();

jest.mock('../client', () => ({
  request: (...args: unknown[]) => mockRequest(...args),
}));

const TASK = 't-1';
const ITEM = 'i-1';

function snapshot(items: { id: string; content: string }[]) {
  return {
    code: 0,
    message: 'success',
    data: { size: items.length, items: items.map((i) => ({ ...i, status: 'queued' })) },
  };
}

beforeEach(() => {
  mockRequest.mockReset();
});

test('提交时把 content 编成 base64，后端 []byte 才认', async () => {
  mockRequest.mockResolvedValueOnce(snapshot([]));
  await submitQueuedInput(TASK, { content: '你好 hi', delivery: 'interrupt' });
  const body = mockRequest.mock.calls[0][1].body;
  expect(body.delivery).toBe('interrupt');
  expect(Buffer.from(body.content, 'base64').toString('utf8')).toBe('你好 hi');
});

test('列表把 base64 解回明文', async () => {
  const encoded = Buffer.from('排队消息', 'utf8').toString('base64');
  mockRequest.mockResolvedValueOnce(snapshot([{ id: ITEM, content: encoded }]));
  const resp = await listQueuedInputs(TASK);
  expect(resp.data?.items?.[0].content).toBe('排队消息');
});

test('非法 base64 原样返回，不抛错', async () => {
  mockRequest.mockResolvedValueOnce(snapshot([{ id: ITEM, content: 'not@@base64' }]));
  const resp = await listQueuedInputs(TASK);
  expect(resp.data?.items?.[0].content).toBe('not@@base64');
});

test('空 content 归一为空串', async () => {
  mockRequest.mockResolvedValueOnce(snapshot([{ id: ITEM, content: '' }]));
  const resp = await listQueuedInputs(TASK);
  expect(resp.data?.items?.[0].content).toBe('');
});

test('改投递与撤回都返回解码后的快照', async () => {
  const encoded = Buffer.from('再来一条', 'utf8').toString('base64');
  mockRequest.mockResolvedValueOnce(snapshot([{ id: ITEM, content: encoded }]));
  const put = await updateQueuedInputDelivery(TASK, ITEM, 'immediate');
  expect(mockRequest.mock.calls[0][1]).toMatchObject({ method: 'PUT', body: { delivery: 'immediate' } });
  expect(put.data?.items?.[0].content).toBe('再来一条');

  mockRequest.mockResolvedValueOnce(snapshot([]));
  const del = await withdrawQueuedInput(TASK, ITEM);
  expect(mockRequest.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
  expect(del.data?.size).toBe(0);
});

test('后端返回 data 为 null 时原样透传', async () => {
  mockRequest.mockResolvedValueOnce({ code: 0, message: 'success', data: null });
  const resp = await withdrawQueuedInput(TASK, ITEM);
  expect(resp.data).toBeNull();
});

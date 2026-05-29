#!/usr/bin/env python3
"""
Trio 异步并发编程 Demo
======================
演示 Trio 的核心概念：
1. 基础 async/await + trio.sleep
2. Nursery —— 结构化并发
3. CancelScope —— 取消/超时控制
4. 经典模式：生产者-消费者
5. 竞态条件处理
6. TCP Echo 客户端/服务器
"""

import trio
import time
import random


# ============================================================
# 1. 基础：async/await + trio.sleep
# ============================================================
async def basic_demo():
    """最简单的异步任务：并发 sleep"""
    print("\n" + "=" * 50)
    print("【1】基础并发 Sleep")
    print("=" * 50)

    async def sleeper(name: str, seconds: float):
        print(f"  [{time.strftime('%H:%M:%S')}] {name} 开始，将睡眠 {seconds}s")
        await trio.sleep(seconds)
        print(f"  [{time.strftime('%H:%M:%S')}] {name} 醒来！")

    t0 = time.perf_counter()
    async with trio.open_nursery() as nursery:
        nursery.start_soon(sleeper, "A", 1.0)
        nursery.start_soon(sleeper, "B", 0.5)
        nursery.start_soon(sleeper, "C", 1.5)
        # nursery 在此等待所有子任务完成
    elapsed = time.perf_counter() - t0
    print(f"  全部完成，耗时 {elapsed:.2f}s（最慢的任务决定总时间）")


# ============================================================
# 2. 结构化并发 —— Nursery
# ============================================================
async def nursery_demo():
    """展示 Nursery 的结构化并发特性：
    - 父任务等待所有子任务
    - 任一子任务异常，其他子任务被取消
    """
    print("\n" + "=" * 50)
    print("【2】结构化并发 —— Nursery")
    print("=" * 50)

    async def worker(name: str, work_time: float, fail: bool = False):
        print(f"  [{name}] 开始工作（{work_time}s）")
        for i in range(int(work_time * 10)):
            await trio.sleep(0.1)
        if fail:
            raise ValueError(f"[{name}] 任务失败！")
        print(f"  [{name}] 完成！")
        return f"{name} 的结果"

    try:
        async with trio.open_nursery() as nursery:
            nursery.start_soon(worker, "worker-1", 0.5)
            nursery.start_soon(worker, "worker-2", 1.0)
            nursery.start_soon(worker, "worker-3-bad", 0.3, True)  # 这个会失败
            nursery.start_soon(worker, "worker-4", 2.0)  # 会被取消
        print("  ✅ 全部成功")
    except Exception as e:
        print(f"  ❌ Nursery 因异常退出: {e}")
        print("    （worker-4 已被自动取消，不会继续运行）")


# ============================================================
# 3. CancelScope —— 取消与超时控制
# ============================================================
async def cancel_scope_demo():
    """展示 CancelScope：超时控制和主动取消"""
    print("\n" + "=" * 50)
    print("【3】CancelScope —— 超时与取消")
    print("=" * 50)

    # 3a. 超时控制
    print("  --- 3a. 超时控制 ---")
    async def long_task():
        print("    开始一个很长的任务...")
        await trio.sleep(10)
        print("    任务完成（不会到这里）")

    try:
        with trio.move_on_after(1.0) as cancel_scope:  # 1s 后取消
            await long_task()
        if cancel_scope.cancelled_caught:
            print("    ⏰ 任务被超时取消！")
    except Exception as e:
        print(f"    异常: {e}")

    # 3b. 在取消时执行清理
    print("\n  --- 3b. 取消时的清理 ---")
    async def cleanable_task():
        print("    开始可清理任务...")
        try:
            await trio.sleep(5)
        finally:
            # finally 块在取消时也会执行
            print("    🧹 执行清理工作...")
            await trio.sleep(0.1)  # 清理中的异步操作
            print("    🧹 清理完成！")

    with trio.move_on_after(0.5) as scope:
        await cleanable_task()
    print(f"    取消状态: cancelled={scope.cancelled_caught}")


# ============================================================
# 4. 生产者-消费者模式（使用 MemorySendChannel / MemoryReceiveChannel）
# ============================================================
async def producer_consumer_demo():
    """生产者-消费者模式：使用 trio 的 Channel"""
    print("\n" + "=" * 50)
    print("【4】生产者-消费者模式")
    print("=" * 50)

    async def producer(send_channel: trio.MemorySendChannel, name: str):
        for i in range(5):
            data = f"{name}-item-{i}"
            await send_channel.send(data)
            print(f"  📤 [{name}] 生产: {data}")
            await trio.sleep(random.uniform(0.1, 0.3))
        # 生产者完成后关闭发送端
        await send_channel.aclose()

    async def consumer(recv_channel: trio.MemoryReceiveChannel, name: str):
        async for value in recv_channel:
            print(f"  📥 [{name}] 消费: {value}")
            await trio.sleep(random.uniform(0.2, 0.4))  # 模拟处理耗时
        print(f"  📥 [{name}] 信道关闭，消费者退出")

    send, recv = trio.open_memory_channel(0)  # 无缓冲

    async with trio.open_nursery() as nursery:
        nursery.start_soon(producer, send.clone(), "P1")
        nursery.start_soon(producer, send.clone(), "P2")
        nursery.start_soon(consumer, recv.clone(), "C1")
        nursery.start_soon(consumer, recv.clone(), "C2")
        # 关闭最初的 send/recv（clone 产生的独立）
        await send.aclose()
        await recv.aclose()


# ============================================================
# 5. 竞态处理 —— 多个源竞争，取最快结果
# ============================================================
async def race_demo():
    """竞态（race）：多个数据源并发请求，只取最快的"""
    print("\n" + "=" * 50)
    print("【5】竞态处理 —— 取最快结果")
    print("=" * 50)

    async def fetch_from(source: str, delay: float) -> str:
        print(f"  向 {source} 请求数据（延迟 {delay}s）...")
        await trio.sleep(delay)
        return f"{source}-response"

    async with trio.open_nursery() as nursery:
        # 使用 channel 来收集最快的结果
        send_channel, recv_channel = trio.open_memory_channel(1)

        async def race_fetcher(source: str, delay: float):
            result = await fetch_from(source, delay)
            try:
                await send_channel.send(result)
            except trio.BrokenResourceError:
                pass  # 已经有人抢先了

        nursery.start_soon(race_fetcher, "源A(快)", 0.3)
        nursery.start_soon(race_fetcher, "源B(慢)", 1.0)
        nursery.start_soon(race_fetcher, "源C(中)", 0.6)

        # 只取第一个到达的
        winner = await recv_channel.receive()
        print(f"\n  🏆 最快结果来自: {winner}")
        await send_channel.aclose()
        nursery.cancel_scope.cancel()  # 取消其余任务


# ============================================================
# 6. TCP Echo 客户端/服务器
# ============================================================
async def tcp_echo_demo():
    """Trio TCP Echo：服务器 + 多个客户端"""
    print("\n" + "=" * 50)
    print("【6】TCP Echo 客户端/服务器")
    print("=" * 50)

    HOST, PORT = "127.0.0.1", 12500

    async def echo_server():
        """回显服务器：接收并原样返回"""
        await trio.serve_tcp(
            handler=echo_handler,
            port=PORT,
            host=HOST,
        )

    async def echo_handler(stream: trio.SocketStream):
        peer = stream.socket.getpeername()
        print(f"  🔗 服务器: 新连接来自 {peer}")
        try:
            async for data in stream:
                msg = data.decode().strip()
                print(f"  📨 服务器收到: {msg}")
                await stream.send_all(f"ECHO: {msg}\n".encode())
        except Exception as e:
            print(f"  ⚠️ 连接错误: {e}")
        print(f"  🔌 服务器: {peer} 断开")

    async def echo_client(client_id: int, messages: list[str]):
        """客户端：发送消息并接收回显"""
        await trio.sleep(0.2)  # 等服务器先就绪
        stream = await trio.open_tcp_stream(HOST, PORT)
        print(f"  👤 客户端{client_id}: 已连接")

        for msg in messages:
            await stream.send_all(f"{msg}\n".encode())
            reply = await stream.receive_some(1024)
            print(f"  👤 客户端{client_id}: 发送 '{msg}' -> 收到 '{reply.decode().strip()}'")
            await trio.sleep(0.1)

        await stream.aclose()
        print(f"  👤 客户端{client_id}: 断开")

    async with trio.open_nursery() as nursery:
        # 启动服务器
        nursery.start_soon(echo_server)
        await trio.sleep(0.1)  # 给服务器一点启动时间

        # 启动多个客户端
        nursery.start_soon(echo_client, 1, ["Hello", "World"])
        nursery.start_soon(echo_client, 2, ["Foo", "Bar"])
        nursery.start_soon(echo_client, 3, ["Trio", "is", "awesome"])

        # 让客户端都跑完
        await trio.sleep(3)
        nursery.cancel_scope.cancel()  # 停掉服务器


# ============================================================
# 7. 错误处理与重试
# ============================================================
async def retry_demo():
    """使用 trio 实现重试逻辑"""
    print("\n" + "=" * 50)
    print("【7】错误处理与重试")
    print("=" * 50)

    attempt = 0

    async def flaky_operation():
        nonlocal attempt
        attempt += 1
        await trio.sleep(0.2)
        if attempt < 3:
            raise ConnectionError(f"第 {attempt} 次尝试失败")
        return f"第 {attempt} 次尝试成功！"

    for retry in range(5):
        try:
            with trio.fail_after(2.0):  # 单次超时
                result = await flaky_operation()
                print(f"  ✅ {result}")
                break
        except ConnectionError as e:
            print(f"  🔄 {e}，等待重试...")
            await trio.sleep(0.3 * (retry + 1))  # 指数退避
        except trio.TooSlowError:
            print(f"  ⏰ 第 {retry + 1} 次尝试超时")
    else:
        print("  ❌ 所有重试均失败")


# ============================================================
# 主函数
# ============================================================
async def main():
    print("╔══════════════════════════════════════════════╗")
    print("║      🐍 Trio 异步并发编程 Demo               ║")
    print("╚══════════════════════════════════════════════╝")

    await basic_demo()
    await nursery_demo()
    await cancel_scope_demo()
    await producer_consumer_demo()
    await race_demo()
    await tcp_echo_demo()
    await retry_demo()

    print("\n" + "=" * 50)
    print("🎉 所有 Demo 运行完毕！")
    print("=" * 50)


if __name__ == "__main__":
    trio.run(main)

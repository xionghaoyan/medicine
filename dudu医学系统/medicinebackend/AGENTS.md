# dudu 后端开发规范

权威文档：`../docs/HIS开发文档.md` §1.3、§2.2、§4、§5。

- FastAPI + Pydantic 2 + sqlite3。routers 做 HTTP，services 管事务，SQL 全部参数化。
- SQLite 开启外键、WAL、busy_timeout，写操作使用 BEGIN IMMEDIATE。
- 新项目仅在自己的 data/dudu.sqlite3 初始化，后续启动保留原记录；迁移前备份，不删库重建。
- 金额为整数分，价格从药品档案快照取得。收费预留、发药出库、退费释放预留，重复操作幂等。
- 使用 dudu_his_session cookie，后端校验角色、会话有效性和医生归属。日志不记录密码或令牌。
- 测试使用临时数据库，执行 pytest、ruff check 和 ruff format --check，不能操作运行库。

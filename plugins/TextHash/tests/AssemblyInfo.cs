// Each test gets its own class instance and fakes, so methods can run in parallel.
[assembly: Parallelize(Scope = ExecutionScope.MethodLevel)]

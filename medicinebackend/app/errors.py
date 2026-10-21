class BusinessError(Exception):
    def __init__(self, status: int, code: str, message: str, details=None):
        self.status = status
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)


def require(condition, message: str, status: int = 409, code: str = "CONFLICT"):
    if not condition:
        raise BusinessError(status, code, message)

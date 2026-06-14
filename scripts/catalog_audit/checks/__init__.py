"""Audit check result types."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Finding:
    severity: str  # error | warning | info
    check: str
    message: str
    details: dict = field(default_factory=dict)


@dataclass
class CheckResult:
    name: str
    passed: bool
    findings: list[Finding] = field(default_factory=list)
    stats: dict = field(default_factory=dict)

    @property
    def errors(self) -> int:
        return sum(1 for f in self.findings if f.severity == "error")

    @property
    def warnings(self) -> int:
        return sum(1 for f in self.findings if f.severity == "warning")

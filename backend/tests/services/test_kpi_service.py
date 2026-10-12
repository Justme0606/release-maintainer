"""Tests for the pure KPI helpers: pick parsing, name matching, business days."""

from datetime import date

from app.services.kpi_service import (
    KpiService,
    _add_business_days,
    _normalize_pkg_name,
    _parse_package_pick,
)

PICK_FILE = '''#!/bin/bash

##### BASE PACKAGES #####

PACKAGES="${PACKAGES} coq-core.9.1.0"

##### "FULL" COQ PLATFORM PACKAGES #####

PACKAGES="${PACKAGES} coq-mathcomp-ssreflect.2.2.0"
PACKAGES="${PACKAGES} coq-equations.1.3+8.19 coq-elpi.2.0.1"
# PACKAGES="${PACKAGES} coq-unicoq.1.6"  # error with unicoq
if false
PACKAGES="${PACKAGES} coq-paramcoq.1.1.3"
fi
PACKAGES="${PACKAGES} coq-hierarchy-builder.1.7.0"
'''


# ------------------------------------------------------------------
#  package-pick parsing
# ------------------------------------------------------------------


def test_packages_before_the_full_marker_are_ignored():
    """Base and IDE packages are not part of the tracked release scope."""
    names = [pkg["name"] for pkg in _parse_package_pick(PICK_FILE)]

    assert "coq-core" not in names


def test_several_packages_on_one_line_are_all_captured():
    packages = {pkg["name"]: pkg for pkg in _parse_package_pick(PICK_FILE)}

    assert packages["coq-equations"]["version"] == "1.3+8.19"
    assert packages["coq-elpi"]["version"] == "2.0.1"


def test_version_splits_on_the_first_dot_only():
    packages = {pkg["name"]: pkg for pkg in _parse_package_pick(PICK_FILE)}

    assert packages["coq-mathcomp-ssreflect"]["version"] == "2.2.0"


def test_commented_package_is_disabled_and_keeps_its_reason():
    packages = {pkg["name"]: pkg for pkg in _parse_package_pick(PICK_FILE)}

    assert packages["coq-unicoq"]["disabled"] is True
    assert packages["coq-unicoq"]["comment"] == "error with unicoq"


def test_package_inside_an_if_false_block_is_disabled():
    packages = {pkg["name"]: pkg for pkg in _parse_package_pick(PICK_FILE)}

    assert packages["coq-paramcoq"]["disabled"] is True
    assert packages["coq-paramcoq"]["comment"] is None


def test_parsing_resumes_after_the_if_false_block_closes():
    packages = {pkg["name"]: pkg for pkg in _parse_package_pick(PICK_FILE)}

    assert packages["coq-hierarchy-builder"]["disabled"] is False


def test_an_empty_file_yields_no_packages():
    assert _parse_package_pick("") == []


# ------------------------------------------------------------------
#  Package name normalisation
# ------------------------------------------------------------------


def test_the_mathcomp_prefix_wins_over_the_shorter_coq_prefix():
    assert _normalize_pkg_name("coq-mathcomp-ssreflect") == "ssreflect"


def test_coq_and_rocq_prefixes_normalise_to_the_same_name():
    assert _normalize_pkg_name("coq-elpi") == _normalize_pkg_name("rocq-elpi")


def test_names_are_matched_case_insensitively():
    assert _normalize_pkg_name("Coq-Equations") == "equations"


def test_a_name_without_a_known_prefix_is_left_alone():
    assert _normalize_pkg_name("stdpp") == "stdpp"


# ------------------------------------------------------------------
#  Business-day arithmetic
# ------------------------------------------------------------------


def test_adding_a_business_day_skips_the_weekend():
    friday = date(2026, 1, 2)

    assert _add_business_days(friday, 1) == date(2026, 1, 5)  # Monday


def test_subtracting_business_days_skips_backwards_over_weekends():
    monday = date(2026, 1, 5)

    assert _add_business_days(monday, -5) == date(2025, 12, 29)


def test_zero_business_days_is_the_same_date():
    assert _add_business_days(date(2026, 1, 2), 0) == date(2026, 1, 2)


# ------------------------------------------------------------------
#  Status counting
# ------------------------------------------------------------------


def packages(*statuses, disabled: int = 0) -> list[dict]:
    result = [{"status": status, "disabled": False} for status in statuses]
    result += [{"status": "ready", "disabled": True} for _ in range(disabled)]
    return result


def test_statuses_are_counted_per_bucket():
    counts = KpiService._count_package_statuses(
        packages("ready", "ready", "waiting", "blocked", disabled=2)
    )

    assert counts == (2, 1, 1, 2)


def test_a_disabled_package_is_never_counted_as_ready():
    """Disabled packages carry a status but must only land in the disabled bucket."""
    assert KpiService._count_package_statuses(packages(disabled=3)) == (0, 0, 0, 3)


def test_unknown_statuses_fall_into_no_bucket():
    """Without a tracking issue every package is "unknown", so the four
    counters stay at zero while the package list is not empty."""
    assert KpiService._count_package_statuses(packages("unknown", "unknown")) == (
        0,
        0,
        0,
        0,
    )

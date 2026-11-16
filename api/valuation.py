"""Exact budget arithmetic. Rates are always PHP per one USD."""

import re
from decimal import Decimal, localcontext


def parse_decimal(value: str, *, places: int, positive: bool = False) -> Decimal:
    if not isinstance(value, str) or not re.fullmatch(
        r"[0-9]{1,12}(?:\.[0-9]{1," + str(places) + r"})?", value
    ):
        raise ValueError(
            f"Use a decimal string with up to 12 integer and {places} decimal places."
        )
    result = Decimal(value)
    if positive and result <= 0:
        raise ValueError("Rate must be greater than zero.")
    return result


def money(value: Decimal) -> str:
    whole, _, fraction = format(abs(value) if value == 0 else value, "f").partition(".")
    return f"{whole}.{fraction.rstrip('0').ljust(4, '0')}"


def metrics(
    in_php: Decimal,
    in_usd: Decimal,
    out_php: Decimal,
    out_usd: Decimal,
    complete: bool,
    rate: Decimal | None,
) -> dict:
    with localcontext() as context:
        context.prec = 50
        net_usd = in_usd - out_usd
        available = complete and (rate is not None or (in_usd == 0 and out_usd == 0))
        incoming = in_php + in_usd * (rate or 0)
        outgoing = out_php + out_usd * (rate or 0)
        return {
            "incoming_php": money(incoming) if available else None,
            "outgoing_php": money(outgoing) if available else None,
            "profit_php": money(incoming - outgoing) if available else None,
            "net_usd": money(net_usd) if complete else None,
            "complete": complete,
        }

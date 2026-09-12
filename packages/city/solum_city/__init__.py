"""
The city base under the massing model.

`solum_massing` answers one question well: what may be built on *this* plot. It fetches the
subject parcel live, derives its neighbours on the fly, and throws all of it away when the
request ends. That is right for a study and wrong for a city -- a district cannot be rebuilt
from it, the same parcel yields a different answer on a different day, and nothing records
which day.

This package is the layer underneath: an offline pipeline that acquires a district once,
resolves a height for every parcel through a chain that never guesses, and bakes a
renderer-ready district with a manifest saying exactly what it was made from. Raw downloads
are immutable; everything else is regenerable from them.

It is additive. It imports from `solum_massing` and changes nothing there.
"""

__all__ = ['cityconfig', 'schema', 'acquire', 'heights', 'build']
